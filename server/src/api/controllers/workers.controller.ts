import type { Request, Response, NextFunction } from 'express';
import { getPool } from '../../shared/config/db';
import { sendSuccess, sendPaginated } from '../../shared/lib/response';
import { AppError, HttpStatus } from '../../shared/lib/errors';

/** Maximum items per page for list queries */
const MAX_PAGE_LIMIT = 100;
/** Default items per page */
const DEFAULT_PAGE_LIMIT = 20;

function parsePagination(query: Record<string, unknown>): { limit: number; offset: number } {
  const rawLimit = Number(query.limit) || DEFAULT_PAGE_LIMIT;
  const limit = Math.min(Math.max(1, rawLimit), MAX_PAGE_LIMIT);
  const offset = Math.max(0, Number(query.offset) || 0);
  return { limit, offset };
}

/**
 * GET /workers
 * Lists all registered workers with their current status and heartbeat.
 */
export async function listWorkers(req: Request, res: Response, next: NextFunction) {
  const pool = getPool();

  try {
    const { limit, offset } = parsePagination(req.query as Record<string, unknown>);
    const statusFilter = req.query.status as string | undefined;

    const conditions = ['1=1'];
    const values: unknown[] = [];
    let paramIdx = 1;

    if (statusFilter) {
      conditions.push(`w.status = $${paramIdx}`);
      values.push(statusFilter);
      paramIdx++;
    }

    const whereClause = conditions.join(' AND ');

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total FROM workers w WHERE ${whereClause}`,
      values,
    );
    const total: number = countResult.rows[0].total;

    const dataValues = [...values, limit, offset];
    const { rows } = await pool.query(
      `SELECT w.id, w.hostname, w.status, w.concurrency, w.registered_at,
              COALESCE(h.active_jobs, 0) AS active_jobs,
              h.heartbeat_at AS last_heartbeat_at
       FROM workers w
       LEFT JOIN LATERAL (
         SELECT active_jobs, heartbeat_at
         FROM worker_heartbeats
         WHERE worker_id = w.id
         ORDER BY heartbeat_at DESC
         LIMIT 1
       ) h ON true
       WHERE ${whereClause}
       ORDER BY w.registered_at DESC
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      dataValues,
    );

    sendPaginated(res, rows, total, limit, offset);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /workers/:workerId
 * Gets a single worker with its active job assignments and recent heartbeat history.
 */
export async function getWorker(req: Request, res: Response, next: NextFunction) {
  const workerId = req.params.workerId as string;
  const pool = getPool();

  try {
    const { rows: workerRows } = await pool.query(
      `SELECT w.id, w.hostname, w.status, w.concurrency, w.registered_at,
              COALESCE(h.active_jobs, 0) AS active_jobs,
              h.heartbeat_at AS last_heartbeat_at
       FROM workers w
       LEFT JOIN LATERAL (
         SELECT active_jobs, heartbeat_at
         FROM worker_heartbeats
         WHERE worker_id = w.id
         ORDER BY heartbeat_at DESC
         LIMIT 1
       ) h ON true
       WHERE w.id = $1`,
      [workerId],
    );

    if (workerRows.length === 0) {
      throw new AppError('Worker not found', 'NOT_FOUND', HttpStatus.NOT_FOUND);
    }

    const worker = workerRows[0];

    // Get currently running jobs for this worker
    const { rows: currentJobs } = await pool.query(
      `SELECT id, type, status, started_at
       FROM jobs
       WHERE worker_id = $1 AND status = 'RUNNING'`,
      [workerId]
    );

    // Get recent heartbeats
    const { rows: recentHeartbeats } = await pool.query(
      `SELECT active_jobs, heartbeat_at
       FROM worker_heartbeats
       WHERE worker_id = $1
       ORDER BY heartbeat_at DESC
       LIMIT 10`,
      [workerId]
    );

    worker.current_jobs = currentJobs;
    worker.recent_heartbeats = recentHeartbeats;

    sendSuccess(res, worker);
  } catch (err) {
    next(err);
  }
}
