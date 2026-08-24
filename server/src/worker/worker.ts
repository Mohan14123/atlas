import { Worker as BullWorker, Job as BullJob } from 'bullmq';
import Redis from 'ioredis';
import { getPool } from '../shared/config/db';
import { env } from '../shared/config/env';
import { logger } from '../shared/lib/logger';
import { claimSpecificJob, transitionJobStatus } from '../shared/db/queries/jobs';
import { Semaphore } from './concurrency';
import { JobRegistry } from './registry';
import { WorkerHeartbeat } from './heartbeat';

export interface BullPayload {
  jobId: string;
}

/**
 * Atlas Worker — consumes jobs from BullMQ and processes them through
 * the PostgreSQL state machine.
 *
 * Architecture:
 *   - One BullMQ Worker per active Atlas queue (atlas_<queue_id>).
 *   - Dedicated Redis connection shared across all BullMQ workers.
 *   - PostgreSQL is authoritative: claim, transition, and completion all happen in PG.
 *   - BullMQ is execution transport only.
 *
 * Execution guarantee:
 *   - Exactly-once PG state transition (enforced by FOR UPDATE SKIP LOCKED + status WHERE clause).
 *   - At-least-once handler invocation (if worker crashes after handler succeeds but
 *     before COMPLETED transition, the job will be re-executed after stale worker recovery).
 *
 * Concurrency:
 *   - Local semaphore limits total concurrent jobs across all queues.
 *   - Per-queue PG concurrency_limit is enforced at claim time (SELECT ... WHERE running < limit).
 *   - BullMQ worker concurrency is set to 1 per queue — PG concurrency is authoritative.
 */
export class AtlasWorker {
  private workers: Map<string, BullWorker> = new Map();
  private readonly semaphore: Semaphore;
  private readonly registry: JobRegistry;
  private readonly heartbeat: WorkerHeartbeat;
  private activeJobsCount: number = 0;
  private isShuttingDown: boolean = false;
  private isSyncing: boolean = false;
  private queueCheckInterval: NodeJS.Timeout | null = null;
  private readonly workerConnection: Redis;

  /** Interval between queue sync checks (ms) */
  private static readonly SYNC_INTERVAL_MS = 10_000;

  constructor(
    concurrency: number,
    registry: JobRegistry,
    heartbeat: WorkerHeartbeat,
  ) {
    this.semaphore = new Semaphore(concurrency);
    this.registry = registry;
    this.heartbeat = heartbeat;

    // Dedicated Redis connection for BullMQ Worker instances.
    // BullMQ workers internally duplicate this connection, so sharing
    // the main ioredis singleton would cause connection conflicts.
    this.workerConnection = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: null,  // required by BullMQ
      lazyConnect: true,
    });
    this.workerConnection.on('error', (err) => {
      logger.error('Worker Redis connection error', { error: err.message, service: 'worker' });
    });
  }

  async start(): Promise<void> {
    const workerId = this.heartbeat.getWorkerId();

    if (!workerId) {
      throw new Error('Worker must be registered (heartbeat started) before starting consumption');
    }

    // Initial sync
    await this.syncQueues(workerId);

    // Periodically check for new/removed queues
    this.queueCheckInterval = setInterval(() => {
      this.syncQueues(workerId).catch((err) => {
        logger.error('Failed to sync queues', { error: err.message, service: 'worker' });
      });
    }, AtlasWorker.SYNC_INTERVAL_MS);

    logger.info(`Atlas Worker started consuming from dynamically synced queues`, {
      service: 'worker',
      worker_id: workerId,
    });
  }

  /**
   * Synchronizes BullMQ Workers with active (non-paused) Atlas queues.
   * Protected by a `isSyncing` guard to prevent concurrent sync calls
   * from creating duplicate Worker instances.
   */
  private async syncQueues(workerId: string): Promise<void> {
    if (this.isShuttingDown || this.isSyncing) return;
    this.isSyncing = true;

    try {
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
          await worker.close().catch(err => {
            logger.error(`Error closing worker for queue ${queueId}`, {
              error: err.message,
              service: 'worker',
              queue_id: queueId,
            });
          });
          logger.info(`Stopped consuming queue atlas_${queueId}`, {
            service: 'worker',
            queue_id: queueId,
          });
        }
      }
    } finally {
      this.isSyncing = false;
    }
  }

  private startWorkerForQueue(queueId: string, workerId: string) {
    const queueName = `atlas_${queueId}`;

    // Guard: If a worker already exists for this queue (shouldn't happen due to
    // syncQueues guard, but defensive), skip creation.
    if (this.workers.has(queueId)) return;

    const worker = new BullWorker(queueName, async (bullJob: BullJob) => {
      const data = bullJob.data as BullPayload;
      if (!data || !data.jobId) {
        logger.warn('Skipping malformed BullMQ job', {
          service: 'worker',
          bullJobId: bullJob.id,
          queue_id: queueId,
        });
        return;
      }

      await this.processJob(data.jobId, workerId, queueId);
    }, {
      connection: this.workerConnection,
      // BullMQ concurrency = 1 per queue. Actual concurrency is controlled by
      // the PG-level concurrency_limit and local semaphore.
      // Setting this to 1 means BullMQ delivers one job at a time per queue,
      // and the semaphore throttles across all queues.
      concurrency: 1,
      autorun: true,
    });

    worker.on('error', (err) => {
      logger.error(`BullMQ worker error for queue ${queueName}`, {
        error: err.message,
        service: 'worker',
        queue_id: queueId,
      });
    });

    this.workers.set(queueId, worker);
    logger.info(`Started consuming queue ${queueName}`, {
      service: 'worker',
      queue_id: queueId,
    });
  }

  private async processJob(jobId: string, workerId: string, queueId: string): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }

    const pool = getPool();

    // 1. Claim in Postgres (idempotent — returns null if already claimed/completed)
    let claimedJob;
    try {
      claimedJob = await claimSpecificJob(pool, jobId, workerId);
    } catch (err: any) {
      logger.error(`Failed to claim job`, {
        error: err.message,
        service: 'worker',
        job_id: jobId,
        queue_id: queueId,
      });
      return;
    }

    if (!claimedJob) {
      logger.debug(`Job could not be claimed (already claimed or not claimable)`, {
        service: 'worker',
        job_id: jobId,
        queue_id: queueId,
        event: 'claim_conflict',
      });
      return;
    }

    const { type: jobType, payload } = claimedJob;

    const handler = this.registry.getHandler(jobType);
    if (!handler) {
      logger.error(`No handler registered for job type: ${jobType}`, {
        service: 'worker',
        job_id: jobId,
        queue_id: queueId,
      });
      // Mark as FAILED since we can't process it — CLAIMED→FAILED is now allowed
      try {
        await transitionJobStatus(pool, jobId, 'CLAIMED', 'FAILED');
      } catch (transErr: any) {
        logger.error(`Failed to mark unhandled job as FAILED`, {
          error: transErr.message,
          service: 'worker',
          job_id: jobId,
        });
      }
      return;
    }

    // Acquire semaphore (throttle locally)
    await this.semaphore.acquire();
    this.incrementActiveJobs();

    const startMs = Date.now();

    // Create execution record
    let executionId: string | null = null;
    try {
      const { rows } = await pool.query<{ id: string }>(`
        INSERT INTO job_executions (id, job_id, worker_id, attempt_number, status, started_at)
        VALUES (gen_random_uuid(), $1, $2, (
          SELECT COALESCE(MAX(attempt_number), 0) + 1 FROM job_executions WHERE job_id = $1
        ), 'running', NOW())
        RETURNING id
      `, [jobId, workerId]);
      executionId = rows[0].id;
    } catch (execErr: any) {
      logger.error(`Failed to create execution record`, {
        error: execErr.message,
        service: 'worker',
        job_id: jobId,
      });
      // Non-fatal: continue processing even if execution record fails
    }

    try {
      // 2. Transition to RUNNING
      await transitionJobStatus(pool, jobId, 'CLAIMED', 'RUNNING', {
        started_at: new Date(),
      });

      // 3. Execute Handler
      logger.info(`Executing job`, {
        service: 'worker',
        job_id: jobId,
        queue_id: queueId,
        job_type: jobType,
      });
      const result = await handler(payload);

      // 4. Mark as COMPLETED
      const durationMs = Date.now() - startMs;
      await transitionJobStatus(pool, jobId, 'RUNNING', 'COMPLETED', {
        completed_at: new Date(),
      });

      // Update execution record
      if (executionId) {
        await pool.query(`
          UPDATE job_executions
          SET status = 'completed', result = $2, completed_at = NOW()
          WHERE id = $1
        `, [executionId, JSON.stringify(result ?? null)]).catch((err: any) => {
          logger.error(`Failed to update execution record`, {
            error: err.message,
            service: 'worker',
            job_id: jobId,
          });
        });
      }

      logger.info(`Completed job`, {
        service: 'worker',
        job_id: jobId,
        queue_id: queueId,
        duration_ms: durationMs,
        status: 'COMPLETED',
      });

    } catch (err: any) {
      const durationMs = Date.now() - startMs;
      logger.error(`Job failed`, {
        error: err.message,
        service: 'worker',
        job_id: jobId,
        queue_id: queueId,
        duration_ms: durationMs,
        status: 'FAILED',
      });
      
      try {
        // Determine current status to pick the correct transition
        const { rows } = await pool.query(`SELECT status FROM jobs WHERE id = $1`, [jobId]);
        const currentStatus = rows[0]?.status;

        if (currentStatus === 'CLAIMED' || currentStatus === 'RUNNING') {
          await transitionJobStatus(pool, jobId, currentStatus, 'FAILED', {
            completed_at: new Date(),
          });
        }
      } catch (dbErr: any) {
        logger.error(`Failed to mark job as FAILED`, {
          error: dbErr.message,
          service: 'worker',
          job_id: jobId,
        });
      }

      // Update execution record on failure
      if (executionId) {
        await pool.query(`
          UPDATE job_executions
          SET status = 'failed', error_message = $2, completed_at = NOW()
          WHERE id = $1
        `, [executionId, err.message]).catch((execErr: any) => {
          logger.error(`Failed to update execution record on failure`, {
            error: execErr.message,
            service: 'worker',
            job_id: jobId,
          });
        });
      }
      
      // Do not re-throw: BullMQ retry is disabled. PG scheduler handles retries.
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
    
    await this.workerConnection.quit().catch(() => {});
    
    logger.info('BullMQ workers closed', { service: 'worker' });
  }
}
