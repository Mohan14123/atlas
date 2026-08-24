import { getPool } from '../../shared/config/db';
import { getBullMQManager } from '../../shared/lib/bullmq-manager';
import { logger } from '../../shared/lib/logger';
import { transitionJobStatusConditional } from '../../shared/db/queries/jobs';

/**
 * Promotes SCHEDULED jobs whose available_at has passed to QUEUED status.
 * Uses the central state-machine transition to enforce invariants,
 * write transition logs, and emit pg_notify atomically.
 */
export async function promoteDelayedJobs() {
  const pool = getPool();
  try {
    // Find candidate job IDs (unbounded scan is safe: SCHEDULED jobs with past available_at are finite)
    const { rows: dueJobs } = await pool.query<{ id: string }>(`
      SELECT id
      FROM jobs
      WHERE status = 'SCHEDULED'
        AND available_at <= NOW()
    `);

    for (const job of dueJobs) {
      // Atomic conditional transition: SCHEDULED→QUEUED only if still SCHEDULED and still due
      const updated = await transitionJobStatusConditional(
        pool,
        job.id,
        'SCHEDULED',
        'QUEUED',
        {},                          // no extra column patches
        'available_at <= NOW()',      // re-check availability window
      );

      // Only enqueue if the transition actually happened (prevents duplicate enqueues)
      if (updated) {
        await getBullMQManager().enqueue(updated.queue_id, updated.type, updated.id);

        logger.info(`Promoted delayed job ${job.id} to QUEUED`, {
          service: 'scheduler',
          job_id: job.id,
          queue_id: updated.queue_id,
        });
      }
    }
  } catch (err: any) {
    logger.error('Failed in promoteDelayedJobs', { error: err.message, service: 'scheduler' });
    throw err;
  }
}
