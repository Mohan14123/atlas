import { Queue as BullQueue } from 'bullmq';
import { getPool } from '../../shared/config/db';
import { getRedis } from '../../shared/config/redis';
import { logger } from '../../shared/lib/logger';

export async function recoverOrphanedJobs() {
  const pool = getPool();
  try {
    // Find orphaned jobs where the assigned worker is unhealthy
    const { rows: orphanedJobs } = await pool.query<{ id: string }>(`
      SELECT j.id
      FROM jobs j
      JOIN workers w ON j.worker_id = w.id
      WHERE j.status IN ('CLAIMED', 'RUNNING')
        AND w.status = 'unhealthy'
    `);

    for (const job of orphanedJobs) {
      // Conditionally update to QUEUED only if it's still CLAIMED/RUNNING and assigned to an unhealthy worker.
      // This prevents race conditions if the worker recovers and updates the status concurrently.
      const { rows } = await pool.query<{ id: string, queue_id: string, type: string, payload: any }>(`
        WITH updated AS (
          UPDATE jobs
          SET    status = 'QUEUED', worker_id = NULL, updated_at = NOW()
          WHERE  id = $1
            AND  status IN ('CLAIMED', 'RUNNING')
            AND  EXISTS (
              SELECT 1 FROM workers w WHERE w.id = jobs.worker_id AND w.status = 'unhealthy'
            )
          RETURNING id, queue_id, type, payload
        ),
        log AS (
          INSERT INTO job_logs (id, job_id, level, message)
          SELECT gen_random_uuid(), id, 'WARN', 'Status transitioned from RUNNING/CLAIMED to QUEUED (Worker Orphaned)'
          FROM updated
          RETURNING id
        )
        SELECT u.id, u.queue_id, u.type, u.payload, pg_notify('job_updated', json_build_object('job_id', u.id, 'status', 'QUEUED')::text)
        FROM updated u
      `, [job.id]);

      // Only enqueue if we actually updated the row
      if (rows.length === 1) {
        const updatedJob = rows[0];
        const bullQueue = new BullQueue(`atlas_${updatedJob.queue_id}`, { connection: getRedis() });
        await bullQueue.add(updatedJob.type, { jobId: updatedJob.id }, { jobId: updatedJob.id });
        await bullQueue.close();

        logger.info(`Recovered orphaned job ${job.id} to QUEUED`, {
          service: 'scheduler',
          job_id: job.id,
        });
      }
    }
  } catch (err: any) {
    logger.error('Failed in recoverOrphanedJobs', { error: err.message, service: 'scheduler' });
    throw err;
  }
}
