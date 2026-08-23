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
  queueId: string;
  jobType: string;
  payload: any;
}

export class AtlasWorker {
  private bullWorker: BullWorker | null = null;
  private readonly semaphore: Semaphore;
  private readonly registry: JobRegistry;
  private readonly heartbeat: WorkerHeartbeat;
  private activeJobsCount: number = 0;
  private isShuttingDown: boolean = false;

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

    this.bullWorker = new BullWorker('atlas-jobs', async (bullJob: BullJob) => {
      // It's possible this was an old message in the queue that doesn't follow the new standard
      const data = bullJob.data as BullPayload;
      if (!data || !data.jobId || !data.jobType) {
        logger.warn('Skipping malformed BullMQ job', { service: 'worker', bullJobId: bullJob.id });
        return;
      }

      await this.processJob(data.jobId, data.jobType, data.payload, workerId);
    }, {
      connection: getRedis(),
      // Concurrency here is virtually infinite, we throttle via our Semaphore
      concurrency: 1000, 
      autorun: true,
    });

    this.bullWorker.on('error', (err) => {
      logger.error('BullMQ worker error', { error: err.message, service: 'worker' });
    });

    logger.info(`Atlas Worker started consuming from atlas-jobs`, { service: 'worker' });
  }

  private async processJob(jobId: string, jobType: string, payload: any, workerId: string): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }

    const handler = this.registry.getHandler(jobType);
    if (!handler) {
      logger.error(`No handler registered for job type: ${jobType}`, { service: 'worker', job_id: jobId });
      // We don't fail the job here immediately because it might be claimed by another worker that DOES have the handler
      // We just don't process it. Another worker or a retry might pick it up if it fails eventually.
      // But if we want to be strict, we could fail it. For now, skip.
      return;
    }

    // Acquire semaphore (throttle locally)
    await this.semaphore.acquire();
    this.incrementActiveJobs();

    const pool = getPool();
    try {
      // 1. Claim in Postgres (Idempotency check)
      const claimedJob = await claimSpecificJob(pool, jobId, workerId);
      
      if (!claimedJob) {
        // Job was claimed by someone else, or already completed, or queue paused.
        // We can safely ACK the BullMQ job by returning successfully.
        logger.debug(`Job ${jobId} could not be claimed by this worker. Skipping.`, { service: 'worker', job_id: jobId });
        return;
      }

      // 2. Transition to RUNNING
      await transitionJobStatus(pool, jobId, 'CLAIMED', 'RUNNING', {
        started_at: new Date(),
      });

      // 3. Execute Handler
      logger.info(`Executing job ${jobId} of type ${jobType}`, { service: 'worker', job_id: jobId });
      const result = await handler(payload);

      // 4. Mark as COMPLETED
      await transitionJobStatus(pool, jobId, 'RUNNING', 'COMPLETED', {
        completed_at: new Date(),
      });
      logger.info(`Completed job ${jobId}`, { service: 'worker', job_id: jobId });

    } catch (err: any) {
      logger.error(`Job ${jobId} failed`, { error: err.message, service: 'worker', job_id: jobId });
      
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
    if (this.bullWorker) {
      await this.bullWorker.close();
      logger.info('BullMQ worker closed', { service: 'worker' });
    }
  }
}
