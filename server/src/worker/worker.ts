import { Worker as BullWorker, Job as BullJob } from 'bullmq';
import { getPool } from '../shared/config/db';
import { getRedis } from '../shared/config/redis';
import { logger } from '../shared/lib/logger';
import { claimSpecificJob, transitionJobStatus } from '../shared/db/queries/jobs';
import { Semaphore } from './concurrency';
import { JobRegistry } from './registry';
import { WorkerHeartbeat } from './heartbeat';

export interface BullPayload {
  jobId: string;
}

export class AtlasWorker {
  private workers: Map<string, BullWorker> = new Map();
  private readonly semaphore: Semaphore;
  private readonly registry: JobRegistry;
  private readonly heartbeat: WorkerHeartbeat;
  private activeJobsCount: number = 0;
  private isShuttingDown: boolean = false;
  private queueCheckInterval: NodeJS.Timeout | null = null;

  constructor(
    concurrency: number,
    registry: JobRegistry,
    heartbeat: WorkerHeartbeat,
  ) {
    this.semaphore = new Semaphore(concurrency);
    this.registry = registry;
    this.heartbeat = heartbeat;
  }

  async start(): Promise<void> {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    const workerId = this.heartbeat.getWorkerId();

    if (!workerId) {
      throw new Error('Worker must be registered (heartbeat started) before starting consumption');
    }

    // Initial sync
    await this.syncQueues(workerId);

    // Periodically check for new queues
    this.queueCheckInterval = setInterval(() => {
      this.syncQueues(workerId).catch((err) => {
        logger.error('Failed to sync queues', { error: err.message, service: 'worker' });
      });
    }, 10000);

    logger.info(`Atlas Worker started consuming from dynamically synced queues`, { service: 'worker' });
  }

  private async syncQueues(workerId: string): Promise<void> {
    if (this.isShuttingDown) return;

    const pool = getPool();
    const { rows } = await pool.query<{ id: string }>('SELECT id FROM queues WHERE is_paused = false');
    const currentQueueIds = new Set(rows.map(r => r.id));

    // Start workers for new queues
    for (const queueId of currentQueueIds) {
      if (!this.workers.has(queueId)) {
        this.startWorkerForQueue(queueId, workerId);
      }
    }

    // Stop workers for deleted or paused queues
    for (const [queueId, worker] of this.workers.entries()) {
      if (!currentQueueIds.has(queueId)) {
        this.workers.delete(queueId);
        worker.close().catch(err => {
          logger.error(`Error closing worker for queue ${queueId}`, { error: err.message });
        });
        logger.info(`Stopped consuming queue atlas_${queueId}`, { service: 'worker' });
      }
    }
  }

  private startWorkerForQueue(queueId: string, workerId: string) {
    const queueName = `atlas_${queueId}`;
    const worker = new BullWorker(queueName, async (bullJob: BullJob) => {
      const data = bullJob.data as BullPayload;
      if (!data || !data.jobId) {
        logger.warn('Skipping malformed BullMQ job', { service: 'worker', bullJobId: bullJob.id });
        return;
      }

      await this.processJob(data.jobId, workerId);
    }, {
      connection: getRedis(),
      concurrency: 1000, 
      autorun: true,
    });

    worker.on('error', (err) => {
      logger.error(`BullMQ worker error for queue ${queueName}`, { error: err.message, service: 'worker' });
    });

    this.workers.set(queueId, worker);
    logger.info(`Started consuming queue ${queueName}`, { service: 'worker' });
  }

  private async processJob(jobId: string, workerId: string): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }

    const pool = getPool();
    // 1. Claim in Postgres (Idempotency check)
    // claimSpecificJob fetches type and payload!
    let claimedJob;
    try {
      claimedJob = await claimSpecificJob(pool, jobId, workerId);
    } catch (err: any) {
      logger.error(`Failed to claim job ${jobId}`, { error: err.message, service: 'worker' });
      return;
    }

    if (!claimedJob) {
      logger.debug(`Job ${jobId} could not be claimed by this worker. Skipping.`, { service: 'worker', job_id: jobId });
      return;
    }

    const { type: jobType, payload } = claimedJob;

    const handler = this.registry.getHandler(jobType);
    if (!handler) {
      logger.error(`No handler registered for job type: ${jobType}`, { service: 'worker', job_id: jobId });
      return;
    }

    // Acquire semaphore (throttle locally)
    await this.semaphore.acquire();
    this.incrementActiveJobs();

    const startMs = Date.now();

    try {
      // 2. Transition to RUNNING
      await transitionJobStatus(pool, jobId, 'CLAIMED', 'RUNNING', {
        started_at: new Date(),
      });

      // 3. Execute Handler
      logger.info(`Executing job ${jobId} of type ${jobType}`, { service: 'worker', job_id: jobId });
      const result = await handler(payload);

      // 4. Mark as COMPLETED
      const durationMs = Date.now() - startMs;
      await transitionJobStatus(pool, jobId, 'RUNNING', 'COMPLETED', {
        completed_at: new Date(),
      });
      logger.info(`Completed job ${jobId}`, { service: 'worker', job_id: jobId, duration_ms: durationMs, status: 'COMPLETED' });

    } catch (err: any) {
      const durationMs = Date.now() - startMs;
      logger.error(`Job ${jobId} failed`, { error: err.message, service: 'worker', job_id: jobId, duration_ms: durationMs, status: 'FAILED' });
      
      try {
        // Find current status to ensure we can transition
        const { rows } = await pool.query(`SELECT status FROM jobs WHERE id = $1`, [jobId]);
        const currentStatus = rows[0]?.status;

        if (currentStatus === 'CLAIMED' || currentStatus === 'RUNNING') {
          // Attempt to mark as FAILED
          await transitionJobStatus(pool, jobId, currentStatus, 'FAILED', {
            completed_at: new Date(),
          });
        }
      } catch (dbErr: any) {
        logger.error(`Failed to mark job ${jobId} as FAILED`, { error: dbErr.message, service: 'worker', job_id: jobId });
      }
      
      // If we throw here, BullMQ will retry based on BullMQ config, which we don't want
      // because we handle retries via Postgres. So we catch and ACK.
    } finally {
      this.decrementActiveJobs();
      this.semaphore.release();
    }
  }

  private incrementActiveJobs() {
    this.activeJobsCount++;
    this.heartbeat.setActiveJobsCount(this.activeJobsCount);
  }

  private decrementActiveJobs() {
    this.activeJobsCount--;
    this.heartbeat.setActiveJobsCount(this.activeJobsCount);
  }

  async close(): Promise<void> {
    this.isShuttingDown = true;
    if (this.queueCheckInterval) {
      clearInterval(this.queueCheckInterval);
    }
    
    const closePromises = Array.from(this.workers.values()).map(worker => worker.close());
    await Promise.all(closePromises);
    this.workers.clear();
    
    logger.info('BullMQ workers closed', { service: 'worker' });
  }
}
