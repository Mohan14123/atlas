import type { Request, Response, NextFunction } from 'express';
import { Queue as BullQueue } from 'bullmq';
import { getPool } from '../../shared/config/db';
import { getRedis } from '../../shared/config/redis';
import { sendSuccess, sendPaginated } from '../../shared/lib/response';
import { AppError, HttpStatus } from '../../shared/lib/errors';
import { replayDLQEntry } from '../../shared/db/queries/dlq';

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
 * Ensures the user has access to the project/organization that the DLQ entry (via Job) belongs to.
 */
async function verifyDLQAccess(entryId: string, userId: string): Promise<void> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT 1 FROM dead_letter_queue d
     JOIN jobs j ON d.job_id = j.id
     JOIN queues q ON j.queue_id = q.id
     JOIN projects p ON q.project_id = p.id
     JOIN organization_members om ON p.organization_id = om.organization_id
     WHERE d.id = $1 AND om.user_id = $2`,
    [entryId, userId],
  );
  if (rows.length === 0) {
    throw new AppError('DLQ entry not found or unauthorized', 'NOT_FOUND', HttpStatus.NOT_FOUND);
  }
}

/**
 * Returns a BullMQ Queue instance.
 */
function getBullQueue(queueId: string): BullQueue {
  return new BullQueue(`atlas_${queueId}`, { connection: getRedis() });
}

/**
 * GET /dlq
 * Lists all DLQ entries with joined job information.
 */
export async function listDLQ(req: Request, res: Response, next: NextFunction) {
  const userId = req.user!.id;
  const pool = getPool();

  try {
    const { limit, offset } = parsePagination(req.query as Record<string, unknown>);
    const queueIdFilter = req.query.queue_id as string | undefined;

    const conditions = [
      `om.user_id = $1`
    ];
    const values: unknown[] = [userId];
    let paramIdx = 2;

    if (queueIdFilter) {
      conditions.push(`j.queue_id = $${paramIdx}`);
      values.push(queueIdFilter);
      paramIdx++;
    }

    const whereClause = conditions.join(' AND ');

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM dead_letter_queue d
       JOIN jobs j ON d.job_id = j.id
       JOIN queues q ON j.queue_id = q.id
       JOIN projects p ON q.project_id = p.id
       JOIN organization_members om ON p.organization_id = om.organization_id
       WHERE ${whereClause}`,
      values,
    );
    const total: number = countResult.rows[0].total;

    const dataValues = [...values, limit, offset];
    const { rows } = await pool.query(
      `SELECT d.id, d.job_id, d.reason, d.attempts, d.error_message, d.failed_at,
              json_build_object(
                'type', j.type,
                'queue_id', j.queue_id,
                'payload', j.payload
              ) as job
       FROM dead_letter_queue d
       JOIN jobs j ON d.job_id = j.id
       JOIN queues q ON j.queue_id = q.id
       JOIN projects p ON q.project_id = p.id
       JOIN organization_members om ON p.organization_id = om.organization_id
       WHERE ${whereClause}
       ORDER BY d.failed_at DESC
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      dataValues,
    );

    sendPaginated(res, rows, total, limit, offset);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /dlq/:entryId
 * Gets a single DLQ entry with full job details and execution history.
 */
export async function getDLQEntry(req: Request, res: Response, next: NextFunction) {
  const userId = req.user!.id;
  const entryId = req.params.entryId as string;
  const pool = getPool();

  try {
    await verifyDLQAccess(entryId, userId);

    const { rows } = await pool.query(
      `SELECT d.id, d.job_id, d.reason, d.attempts, d.error_message, d.failed_at,
              json_build_object(
                'id', j.id,
                'queue_id', j.queue_id,
                'type', j.type,
                'priority', j.priority,
                'payload', j.payload,
                'max_attempts', j.max_attempts,
                'idempotency_key', j.idempotency_key,
                'created_at', j.created_at
              ) as job
       FROM dead_letter_queue d
       JOIN jobs j ON d.job_id = j.id
       WHERE d.id = $1`,
      [entryId],
    );

    if (rows.length === 0) {
      throw new AppError('DLQ entry not found', 'NOT_FOUND', HttpStatus.NOT_FOUND);
    }

    const entry = rows[0];

    // Fetch executions for the job
    const { rows: executions } = await pool.query(
      `SELECT id, job_id, worker_id, attempt_number, status, error_code, error_message, result,
              started_at, completed_at,
              EXTRACT(EPOCH FROM (completed_at - started_at))::int * 1000 AS duration_ms
       FROM job_executions
       WHERE job_id = $1
       ORDER BY attempt_number ASC`,
      [entry.job_id]
    );

    entry.executions = executions;
    entry.ai_summary = null; // As per spec, null unless AI bonus feature enabled

    sendSuccess(res, entry);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /dlq/:entryId/replay
 * Replays a DLQ entry: creates a fresh job from the original payload, removes the DLQ entry.
 */
export async function replayDLQ(req: Request, res: Response, next: NextFunction) {
  const userId = req.user!.id;
  const entryId = req.params.entryId as string;
  const pool = getPool();

  try {
    await verifyDLQAccess(entryId, userId);

    const { rows: [entry] } = await pool.query(
      `SELECT d.id, j.queue_id
       FROM dead_letter_queue d
       JOIN jobs j ON d.job_id = j.id
       WHERE d.id = $1`,
      [entryId]
    );
    if (!entry) {
       throw new AppError('DLQ entry not found', 'NOT_FOUND', HttpStatus.NOT_FOUND);
    }

    const { newJobId } = await replayDLQEntry(pool, entryId);

    // Fetch the newly created job
    const { rows: [newJob] } = await pool.query(
      `SELECT id, status, created_at FROM jobs WHERE id = $1`,
      [newJobId]
    );

    // Enqueue to BullMQ
    const bullQueue = getBullQueue(entry.queue_id);
    await bullQueue.add('dlq-replay', { jobId: newJobId }, { jobId: newJobId });
    await bullQueue.close();

    sendSuccess(res, {
      dlq_entry_id: entryId,
      new_job: newJob
    }, HttpStatus.CREATED);
  } catch (err) {
    // Check if error is thrown from replayDLQEntry regarding not found
    if (err instanceof Error && err.message.includes('not found')) {
      return next(new AppError('DLQ entry not found', 'NOT_FOUND', HttpStatus.NOT_FOUND));
    }
    next(err);
  }
}
