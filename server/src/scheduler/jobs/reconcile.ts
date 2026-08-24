import { Queue as BullQueue } from 'bullmq';
import { getPool } from '../../shared/config/db';
import { getBullMQManager } from '../../shared/lib/bullmq-manager';
import { logger } from '../../shared/lib/logger';

/** Maximum number of stale QUEUED jobs to reconcile per tick — bounds work per cycle. */
const RECONCILE_BATCH_LIMIT = 200;

/**
 * Reconciles QUEUED jobs that have been stuck for >60s by checking whether
 * they exist in BullMQ. If a BullMQ job is missing (e.g. scheduler crashed
 * after PG commit but before Redis enqueue), re-enqueue it.
 *
 * Guarantees:
 *   - Uses idempotent BullMQ job IDs (jobId = PG job ID) — safe to re-enqueue.
 *   - Does not resurrect COMPLETED/CANCELLED/FAILED jobs.
 *   - Work is bounded per tick (RECONCILE_BATCH_LIMIT).
 *   - Checks both waiting and active BullMQ states to avoid re-enqueuing
 *     jobs that are already being processed.
 */
export async function reconcile() {
  const pool = getPool();
  try {
    // Find jobs that have been QUEUED for more than 60 seconds (bounded batch)
    const { rows: staleQueuedJobs } = await pool.query<{ id: string; queue_id: string; type: string }>(`
      SELECT id, queue_id, type
      FROM jobs
      WHERE status = 'QUEUED'
        AND updated_at < NOW() - interval '60 seconds'
      ORDER BY updated_at ASC
      LIMIT $1
    `, [RECONCILE_BATCH_LIMIT]);

    if (staleQueuedJobs.length === 0) return;

    // Group jobs by queue for efficient BullMQ lookups
    const jobsByQueue: Record<string, typeof staleQueuedJobs> = {};
    for (const job of staleQueuedJobs) {
      if (!jobsByQueue[job.queue_id]) jobsByQueue[job.queue_id] = [];
      jobsByQueue[job.queue_id].push(job);
    }

    let recoveredCount = 0;

    for (const [queueId, queuedJobs] of Object.entries(jobsByQueue)) {
      // Use the manager's cached queue to check waiting state.
      // For getWaiting/getActive we need direct access to the BullQueue.
      const bullQueue = getBullMQManager().getQueue(queueId);

      try {
        const [waitingJobs, activeJobs] = await Promise.all([
          bullQueue.getWaiting(),
          bullQueue.getActive(),
        ]);
        const existingJobIds = new Set([
          ...waitingJobs.map((j) => j.id),
          ...activeJobs.map((j) => j.id),
        ]);

        for (const job of queuedJobs) {
          // Double-check Postgres still says it's QUEUED
          // (guards against concurrent transition to CLAIMED/CANCELLED/etc.)
          const { rows: currentJob } = await pool.query(
            `SELECT status FROM jobs WHERE id = $1`,
            [job.id],
          );

          if (currentJob.length === 0 || currentJob[0].status !== 'QUEUED') {
            continue;
          }

          if (!existingJobIds.has(job.id)) {
            await getBullMQManager().enqueue(queueId, job.type, job.id);
            recoveredCount++;
            logger.warn(`Reconciled missing BullMQ job`, {
              service: 'scheduler',
              job_id: job.id,
              queue_id: queueId,
              event: 'reconciliation_recovered',
            });
          }
        }
      } catch (err: any) {
        // Log per-queue errors but don't abort entire reconciliation
        logger.error(`Reconcile error for queue ${queueId}`, {
          error: err.message,
          service: 'scheduler',
          queue_id: queueId,
        });
      }
    }

    if (recoveredCount > 0) {
      logger.info(`Reconciliation completed`, {
        service: 'scheduler',
        recovered_count: recoveredCount,
        checked_count: staleQueuedJobs.length,
      });
    }
  } catch (err: any) {
    logger.error('Failed in reconcile', { error: err.message, service: 'scheduler' });
    throw err;
  }
}
