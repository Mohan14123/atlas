import { Queue as BullQueue } from 'bullmq';
import { getPool } from '../../shared/config/db';
import { getRedis } from '../../shared/config/redis';
import { logger } from '../../shared/lib/logger';

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
      // The attempt_count is how many times it has ACTUALLY executed.
      // E.g., if attempt_count = 1, we are preparing the 2nd attempt.
      const retryNumber = Math.max(1, job.attempt_count);

      if (job.strategy === 'fixed') {
        delayMs = job.initial_delay_ms;
      } else if (job.strategy === 'linear') {
        delayMs = job.initial_delay_ms * retryNumber;
      } else if (job.strategy === 'exponential') {
        delayMs = job.initial_delay_ms * Math.pow(2, retryNumber - 1);
      }
      
      // Cap the delay and add a small random jitter (0-10%)
      delayMs = Math.min(delayMs, job.max_delay_ms);
      delayMs = delayMs + (delayMs * 0.1 * Math.random());

      const nextStatus = delayMs > 0 ? 'SCHEDULED' : 'QUEUED';
      
      // Idempotent conditional update
      const { rowCount } = await pool.query(`
        WITH updated AS (
          UPDATE jobs
          SET    status = $2, available_at = NOW() + ($3 || ' milliseconds')::interval, attempt_count = attempt_count + 1, updated_at = NOW()
          WHERE  id = $1
            AND  status = 'FAILED'
            AND  attempt_count < max_attempts
          RETURNING id
        ),
        log AS (
          INSERT INTO job_logs (id, job_id, level, message)
          SELECT gen_random_uuid(), id, 'INFO', 'Status transitioned from FAILED to ' || $2::text || ' (Retry Mechanism)'
          FROM updated
          RETURNING id
        )
        SELECT pg_notify('job_updated', json_build_object('job_id', u.id, 'status', $2)::text)
        FROM updated u
      `, [job.id, nextStatus, Math.round(delayMs)]);

      // Only enqueue if we actually updated the row AND it's going straight to QUEUED
      if (rowCount === 1 && nextStatus === 'QUEUED') {
        const bullQueue = new BullQueue(`atlas_${job.queue_id}`, { connection: getRedis() });
        await bullQueue.add(job.type, { jobId: job.id }, { jobId: job.id });
        await bullQueue.close();
      }

      if (rowCount === 1) {
        logger.info(`Retrying failed job ${job.id} (status: ${nextStatus}, delay: ${Math.round(delayMs)}ms)`, {
          service: 'scheduler',
          job_id: job.id,
        });
      }
    }
  } catch (err: any) {
    logger.error('Failed in retryFailedJobs', { error: err.message, service: 'scheduler' });
    throw err;
  }
}
