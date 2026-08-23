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

    const jobsByQueue: Record<string, typeof staleQueuedJobs> = {};
    for (const job of staleQueuedJobs) {
      if (!jobsByQueue[job.queue_id]) jobsByQueue[job.queue_id] = [];
      jobsByQueue[job.queue_id].push(job);
    }

    for (const [queueId, queuedJobs] of Object.entries(jobsByQueue)) {
      const bullQueue = new BullQueue(`atlas_${queueId}`, { connection: getRedis() });
      try {
        const waitingJobs = await bullQueue.getWaiting();
        const waitingJobIds = new Set(waitingJobs.map((j) => j.id));

        for (const job of queuedJobs) {
          // Double-check Postgres still says it's QUEUED
          const { rows: currentJob } = await pool.query(`
            SELECT status FROM jobs WHERE id = $1
          `, [job.id]);

          if (currentJob.length === 0 || currentJob[0].status !== 'QUEUED') {
            continue;
          }

          if (!waitingJobIds.has(job.id)) {
            await bullQueue.add(job.type, { jobId: job.id }, { jobId: job.id });
            logger.warn(`Reconciled missing BullMQ job ${job.id}`, { service: 'scheduler', job_id: job.id });
          }
        }
      } finally {
        await bullQueue.close();
      }
    }
  } catch (err: any) {
    logger.error('Failed in reconcile', { error: err.message, service: 'scheduler' });
    throw err;
  }
}
