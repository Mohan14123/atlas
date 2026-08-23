import type { Pool } from 'pg';

export interface WorkerRow {
  id: string;
  hostname: string;
  status: string;
  concurrency: number;
  registered_at: Date;
}

export async function registerWorker(
  pool: Pool,
  hostname: string,
  concurrency: number,
): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO workers (id, hostname, concurrency, status, registered_at)
     VALUES (gen_random_uuid(), $1, $2, 'idle', NOW())
     RETURNING id`,
    [hostname, concurrency],
  );
  return rows[0].id;
}

export async function upsertHeartbeat(
  pool: Pool,
  workerId: string,
  activeJobs: number,
): Promise<void> {
  await pool.query(
    `INSERT INTO worker_heartbeats (id, worker_id, active_jobs, heartbeat_at)
     VALUES (gen_random_uuid(), $1, $2, NOW())`,
    [workerId, activeJobs],
  );
  await pool.query(
    `UPDATE workers SET status = $2 WHERE id = $1`,
    [workerId, activeJobs > 0 ? 'active' : 'idle'],
  );
}

/** Returns workers whose most recent heartbeat is older than `thresholdMs`. */
export async function findStaleWorkers(pool: Pool, thresholdMs = 30_000): Promise<WorkerRow[]> {
  const { rows } = await pool.query<WorkerRow>(`
    SELECT DISTINCT ON (w.id) w.*
    FROM   workers w
    LEFT JOIN worker_heartbeats h ON h.worker_id = w.id
    WHERE  w.status NOT IN ('unhealthy', 'offline')
      AND (h.heartbeat_at IS NULL OR h.heartbeat_at < NOW() - ($1 || ' milliseconds')::interval)
    ORDER  BY w.id
  `, [thresholdMs]);
  return rows;
}

export async function markWorkerUnhealthy(pool: Pool, workerId: string): Promise<void> {
  await pool.query(
    `UPDATE workers SET status = 'unhealthy' WHERE id = $1`,
    [workerId],
  );
}
