import { Queue as BullQueue } from 'bullmq';
import { getPool } from '../../shared/config/db';
import { getRedis } from '../../shared/config/redis';
import { logger } from '../../shared/lib/logger';
import { transitionJobStatusConditional } from '../../shared/db/queries/jobs';
import type { JobStatus } from '../../shared/lib/stateMachine';

/**
 * Retries FAILED jobs that haven't exhausted their max_attempts.
 * Uses the central state-machine transition to enforce invariants.
 *
 * Backoff strategy:
 *   - fixed:       constant delay
 *   - linear:      delay * retryNumber
 *   - exponential: delay * 2^(retryNumber-1)
 *
 * If delay > 0 → FAILED→SCHEDULED (promoted to QUEUED by promoteDelayedJobs later).
 * If delay = 0 → FAILED→QUEUED (immediately available).
 */
export async function retryFailedJobs() {
  const pool = getPool();
  try {
    // Find failed jobs that haven't exhausted their retries, joined with their retry policy
    const { rows: failedJobs } = await pool.query<{
      id: string;
      queue_id: string;
      type: string;
      payload: any;
      attempt_count: number;
      strategy: string;
      initial_delay_ms: number;
      max_delay_ms: number;
    }>(`
      SELECT j.id, j.queue_id, j.type, j.payload, j.attempt_count, 
             rp.strategy, rp.initial_delay_ms, rp.max_delay_ms
      FROM jobs j
      JOIN queues q ON j.queue_id = q.id
      JOIN retry_policies rp ON q.retry_policy_id = rp.id
      WHERE j.status = 'FAILED'
        AND j.attempt_count < j.max_attempts
    `);

    for (const job of failedJobs) {
      let delayMs = 0;
      // attempt_count reflects how many times the job has actually executed.
      // E.g., if attempt_count = 1, we are preparing the 2nd attempt.
      const retryNumber = Math.max(1, job.attempt_count);

      if (job.strategy === 'fixed') {
        delayMs = job.initial_delay_ms;
      } else if (job.strategy === 'linear') {
        delayMs = job.initial_delay_ms * retryNumber;
      } else if (job.strategy === 'exponential') {
        delayMs = job.initial_delay_ms * Math.pow(2, retryNumber - 1);
      }
      
      // Cap the delay and add small random jitter (0-10%) to avoid thundering herd
      delayMs = Math.min(delayMs, job.max_delay_ms);
      const JITTER_FACTOR = 0.1;
      delayMs = delayMs + (delayMs * JITTER_FACTOR * Math.random());

      const nextStatus: JobStatus = delayMs > 0 ? 'SCHEDULED' : 'QUEUED';
      
      // Atomic conditional transition via central state machine.
      // Extra condition ensures we only retry if attempt_count < max_attempts
      // at UPDATE time (guards against concurrent retry by another scheduler).
      const updated = await transitionJobStatusConditional(
        pool,
        job.id,
        'FAILED',
        nextStatus,
        {
          available_at: new Date(Date.now() + Math.round(delayMs)),
          attempt_count: job.attempt_count + 1,
        },
        'attempt_count < max_attempts',
      );

      // Only enqueue if transition succeeded AND job goes directly to QUEUED
      if (updated && nextStatus === 'QUEUED') {
        const bullQueue = new BullQueue(`atlas_${updated.queue_id}`, { connection: getRedis() });
        await bullQueue.add(updated.type, { jobId: updated.id }, { jobId: updated.id });
        await bullQueue.close();
      }

      if (updated) {
        logger.info(`Retrying failed job ${job.id} (status: ${nextStatus}, delay: ${Math.round(delayMs)}ms)`, {
          service: 'scheduler',
          job_id: job.id,
          queue_id: job.queue_id,
        });
      }
    }
  } catch (err: any) {
    logger.error('Failed in retryFailedJobs', { error: err.message, service: 'scheduler' });
    throw err;
  }
}
