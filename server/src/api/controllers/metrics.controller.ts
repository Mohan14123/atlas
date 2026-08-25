import type { Request, Response, NextFunction } from 'express';
import { getPool } from '../../shared/config/db';
import { sendSuccess } from '../../shared/lib/response';
import { getJobCounts, getQueueDepths, getWorkerUtilization } from '../../shared/db/queries/metrics';

/**
 * GET /metrics
 * Returns system-wide operational metrics for the dashboard.
 */
export async function getMetrics(req: Request, res: Response, next: NextFunction) {
  const pool = getPool();
  const windowParam = (req.query.window as string) || '1h';

  try {
    // 1. Jobs Metrics (using shared query)
    const jobCounts = await getJobCounts(pool);
    
    // Parse time window for rate calculations
    let intervalStr = '1 hour';
    if (windowParam === '24h') intervalStr = '24 hours';
    if (windowParam === '7d') intervalStr = '7 days';

    // Throughput and rates
    const { rows: [rates] } = await pool.query(
      `SELECT
         COUNT(*) AS total_window,
         COUNT(*) FILTER (WHERE status = 'COMPLETED') AS success_window,
         COUNT(*) FILTER (WHERE status = 'FAILED') AS failed_window,
         SUM(attempt_count) AS total_retries,
         AVG(EXTRACT(EPOCH FROM (started_at - created_at))) * 1000 AS avg_wait_time_ms,
         AVG(EXTRACT(EPOCH FROM (completed_at - started_at))) * 1000 AS avg_execution_time_ms
       FROM jobs
       WHERE updated_at >= NOW() - $1::interval`,
      [intervalStr]
    );

    const totalWindow = parseInt(rates.total_window || '0');
    const successWindow = parseInt(rates.success_window || '0');
    const failedWindow = parseInt(rates.failed_window || '0');
    const totalRetries = parseInt(rates.total_retries || '0');
    
    let minutesInWindow = 60;
    if (windowParam === '24h') minutesInWindow = 60 * 24;
    if (windowParam === '7d') minutesInWindow = 60 * 24 * 7;

    const throughputPerMinute = totalWindow > 0 ? (totalWindow / minutesInWindow) : 0;
    const successRate = totalWindow > 0 ? (successWindow / totalWindow) : 0;
    const failureRate = totalWindow > 0 ? (failedWindow / totalWindow) : 0;
    const retryRate = totalWindow > 0 ? (totalRetries / totalWindow) : 0;

    // Throughput history (last 60 mins, 10 min buckets)
    const { rows: throughputRows } = await pool.query(
      `SELECT
         to_char(bucket, 'HH24:MI') as time,
         COUNT(jobs.id)::int as count
       FROM generate_series(
         date_trunc('minute', NOW()) - interval '50 minutes',
         date_trunc('minute', NOW()),
         interval '10 minutes'
       ) AS bucket
       LEFT JOIN jobs ON jobs.completed_at >= bucket AND jobs.completed_at < bucket + interval '10 minutes' AND jobs.status = 'COMPLETED'
       GROUP BY bucket
       ORDER BY bucket ASC`
    );
    const throughputHistory = throughputRows;

    // 2. Queue Depths (using shared query)
    const queues = await getQueueDepths(pool);

    // 3. Worker Utilization (using shared query)
    const workerUtil = await getWorkerUtilization(pool);
    
    let totalCapacity = 0;
    let usedCapacity = 0;
    let activeWorkers = 0;
    let idleWorkers = 0;
    let unhealthyWorkers = 0;

    for (const w of workerUtil) {
      if (w.status === 'active') activeWorkers++;
      else if (w.status === 'idle') idleWorkers++;
      else if (w.status === 'unhealthy') unhealthyWorkers++;
      
      totalCapacity += w.concurrency;
      usedCapacity += w.active_jobs;
    }

    const workers = {
      total: workerUtil.length,
      active: activeWorkers,
      idle: idleWorkers,
      unhealthy: unhealthyWorkers,
      total_capacity: totalCapacity,
      used_capacity: usedCapacity,
      utilization: totalCapacity > 0 ? (usedCapacity / totalCapacity) : 0,
      list: workerUtil
    };

    // 4. Scheduler Activity (derived from recent jobs created)
    const { rows: [schedulerActivity] } = await pool.query(
      `SELECT
         COUNT(*) AS jobs_created_this_hour,
         COUNT(*) FILTER (WHERE scheduled_at IS NOT NULL) AS due_schedules_evaluated
       FROM jobs
       WHERE created_at >= NOW() - interval '1 hour'`
    );

    sendSuccess(res, {
      window: windowParam,
      jobs: {
        total_queued: jobCounts.queued,
        total_running: jobCounts.running,
        total_completed: jobCounts.completed,
        total_failed: jobCounts.failed,
        total_dlq: jobCounts.dlq,
        throughput_per_minute: Number(throughputPerMinute.toFixed(2)),
        success_rate: Number(successRate.toFixed(3)),
        failure_rate: Number(failureRate.toFixed(3)),
        retry_rate: Number(retryRate.toFixed(3)),
        avg_wait_time_ms: rates.avg_wait_time_ms ? Math.round(rates.avg_wait_time_ms) : 0,
        avg_execution_time_ms: rates.avg_execution_time_ms ? Math.round(rates.avg_execution_time_ms) : 0,
        throughput_history: throughputHistory
      },
      queues,
      workers,
      scheduler: {
        last_tick_at: new Date().toISOString(), // Mocked as scheduler service handles this separately
        due_schedules_evaluated: parseInt(schedulerActivity.due_schedules_evaluated || '0'),
        jobs_created_this_hour: parseInt(schedulerActivity.jobs_created_this_hour || '0')
      }
    });
  } catch (err) {
    next(err);
  }
}
