import { Queue as BullQueue } from 'bullmq';
import { getPool } from '../../shared/config/db';
import { getRedis } from '../../shared/config/redis';
import { logger } from '../../shared/lib/logger';

export async function promoteDelayedJobs() {
  const pool = getPool();
  try {
    // 1. Find jobs that are due for promotion
    const { rows: dueJobs } = await pool.query<{ id: string; queue_id: string }>(`
      SELECT id, queue_id
      FROM jobs
      WHERE status = 'SCHEDULED'
        AND available_at <= NOW()
    `);

    for (const job of dueJobs) {
      // 2. Conditionally update status to QUEUED (Idempotent DB Transition)
      const { rows } = await pool.query<{ id: string }>(`
        UPDATE jobs
        SET status = 'QUEUED',
            updated_at = NOW()
        WHERE id = $1
          AND status = 'SCHEDULED'
          AND available_at <= NOW()
        RETURNING id
      `, [job.id]);

      // 3. Only enqueue if the update was successful (prevent duplicate enqueues due to concurrent ticks)
      if (rows.length === 1) {
        const bullQueue = new BullQueue(`atlas_${job.queue_id}`, { connection: getRedis() });
        await bullQueue.add('promote', { jobId: job.id }, { jobId: job.id });
        await bullQueue.close();

        logger.info(`Promoted delayed job ${job.id} to QUEUED`, {
          service: 'scheduler',
          job_id: job.id,
        });
      }
    }
  } catch (err: any) {
    logger.error('Failed in promoteDelayedJobs', { error: err.message, service: 'scheduler' });
    throw err;
  }
}
