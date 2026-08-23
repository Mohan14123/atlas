import { Queue as BullQueue } from 'bullmq';
import { getPool } from '../../shared/config/db';
import { getRedis } from '../../shared/config/redis';
import { logger } from '../../shared/lib/logger';

export async function reconcile() {
  const pool = getPool();
  try {
    // 1. Find jobs that have been QUEUED for more than 60 seconds
    const { rows: staleQueuedJobs } = await pool.query<{ id: string; queue_id: string; type: string; payload: any }>(`
      SELECT id, queue_id, type, payload
      FROM jobs
      WHERE status = 'QUEUED'
        AND updated_at < NOW() - interval '60 seconds'
    `);

    for (const job of staleQueuedJobs) {
      // 2. Double-check Postgres still says it's QUEUED (in case it just changed)
      const { rows: currentJob } = await pool.query(`
        SELECT status FROM jobs WHERE id = $1
      `, [job.id]);

      if (currentJob.length === 0 || currentJob[0].status !== 'QUEUED') {
        continue;
      }

      // 3. Check BullMQ for existence by job ID
      const bullQueue = new BullQueue('atlas-jobs', { connection: getRedis() });
      const bullJob = await bullQueue.getJob(job.id);

      if (!bullJob) {
        // 4. Missing from BullMQ! Re-enqueue it.
        await bullQueue.add(job.type, {
          jobId: job.id,
          queueId: job.queue_id,
          jobType: job.type,
          payload: job.payload,
        }, { jobId: job.id });
        logger.warn(`Reconciled missing BullMQ job ${job.id}`, {
          service: 'scheduler',
          job_id: job.id,
        });
      }

      await bullQueue.close();
    }
  } catch (err: any) {
    logger.error('Failed in reconcile', { error: err.message, service: 'scheduler' });
    throw err;
  }
}
