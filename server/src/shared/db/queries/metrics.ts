import type { Pool } from 'pg';

export interface JobCounts {
  scheduled: number;
  queued: number;
  claimed: number;
  running: number;
  completed: number;
  failed: number;
  cancelled: number;
  dlq: number;
}

export interface QueueDepth {
  queue_id: string;
  queue_name: string;
  depth: number;
  running: number;
  is_paused: boolean;
}

export interface WorkerUtil {
  worker_id: string;
  hostname: string;
  status: string;
  concurrency: number;
  active_jobs: number;
  last_heartbeat_at: Date | null;
}

export async function getJobCounts(pool: Pool): Promise<JobCounts> {
  const { rows } = await pool.query<{ status: string; count: string }>(`
    SELECT status, COUNT(*) AS count FROM jobs GROUP BY status
  `);
  const map = Object.fromEntries(rows.map((r) => [r.status.toLowerCase(), parseInt(r.count)]));
  const { rows: [dlq] } = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM dead_letter_queue`,
  );
  return {
    scheduled: map['scheduled']  ?? 0,
    queued:    map['queued']     ?? 0,
    claimed:   map['claimed']    ?? 0,
    running:   map['running']    ?? 0,
    completed: map['completed']  ?? 0,
    failed:    map['failed']     ?? 0,
    cancelled: map['cancelled']  ?? 0,
    dlq:       parseInt(dlq.count),
  };
}

export async function getQueueDepths(pool: Pool): Promise<QueueDepth[]> {
  const { rows } = await pool.query<QueueDepth>(`
    SELECT
      q.id        AS queue_id,
      q.name      AS queue_name,
      q.is_paused,
      COUNT(*) FILTER (WHERE j.status = 'QUEUED')   AS depth,
      COUNT(*) FILTER (WHERE j.status = 'RUNNING')  AS running
    FROM  queues q
    LEFT JOIN jobs j ON j.queue_id = q.id
    GROUP BY q.id, q.name, q.is_paused
  `);
  return rows;
}

export async function getWorkerUtilization(pool: Pool): Promise<WorkerUtil[]> {
  const { rows } = await pool.query<WorkerUtil>(`
    SELECT
      w.id         AS worker_id,
      w.hostname,
      w.status,
      w.concurrency,
      COALESCE(h.active_jobs, 0) AS active_jobs,
      h.heartbeat_at             AS last_heartbeat_at
    FROM  workers w
    LEFT JOIN LATERAL (
      SELECT active_jobs, heartbeat_at
      FROM   worker_heartbeats
      WHERE  worker_id = w.id
      ORDER  BY heartbeat_at DESC
      LIMIT  1
    ) h ON true
    WHERE w.status NOT IN ('offline')
    ORDER BY w.registered_at DESC
  `);
  return rows;
}
