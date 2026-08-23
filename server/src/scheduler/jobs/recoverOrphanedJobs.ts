import { Queue as BullQueue } from 'bullmq';
import { getPool } from '../../shared/config/db';
import { getRedis } from '../../shared/config/redis';
import { logger } from '../../shared/lib/logger';
import { transitionJobStatus } from '../../shared/db/queries/jobs';
import type { JobStatus } from '../../shared/lib/stateMachine';

export async function recoverOrphanedJobs() {
  const pool = getPool();
  try {
    const { rows: orphanedJobs } = await pool.query<{ id: string, status: JobStatus, queue_id: string, type: string }>(`
      SELECT j.id, j.status, j.queue_id, j.type
      FROM jobs j
      JOIN workers w ON j.worker_id = w.id
      WHERE j.status IN ('CLAIMED', 'RUNNING')
        AND w.status = 'unhealthy'
    `);

    for (const job of orphanedJobs) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        
        // Conditionally update to QUEUED only if the assigned worker is still unhealthy
        const { rows: [{ is_unhealthy }] } = await client.query(`
          SELECT EXISTS (
            SELECT 1 FROM jobs j 
            JOIN workers w ON j.worker_id = w.id 
            WHERE j.id = $1 AND w.status = 'unhealthy'
          ) as is_unhealthy
        `, [job.id]);

        if (is_unhealthy) {
          await transitionJobStatus(client, job.id, job.status, 'QUEUED', { worker_id: null });
          
          const bullQueue = new BullQueue(`atlas_${job.queue_id}`, { connection: getRedis() });
          await bullQueue.add(job.type, { jobId: job.id }, { jobId: job.id });
          await bullQueue.close();

          logger.info(`Recovered orphaned job ${job.id} to QUEUED`, {
            service: 'scheduler',
            job_id: job.id,
          });
        }
        await client.query('COMMIT');
      } catch (err: any) {
        await client.query('ROLLBACK');
        logger.warn(`Could not recover orphaned job ${job.id}`, { error: err.message, service: 'scheduler' });
      } finally {
        client.release();
      }
    }
  } catch (err: any) {
    logger.error('Failed in recoverOrphanedJobs', { error: err.message, service: 'scheduler' });
    throw err;
  }
}
