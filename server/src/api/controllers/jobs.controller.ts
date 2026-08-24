import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { Queue as BullQueue } from 'bullmq';
import { getPool } from '../../shared/config/db';
import { getRedis } from '../../shared/config/redis';
import { sendSuccess, sendPaginated } from '../../shared/lib/response';
import { AppError, HttpStatus } from '../../shared/lib/errors';
import { transitionJobStatusConditional } from '../../shared/db/queries/jobs';

// ─── Constants ───────────────────────────────────────────────────────────────

/** Maximum items per page for list queries */
const MAX_PAGE_LIMIT = 100;
/** Default items per page */
const DEFAULT_PAGE_LIMIT = 20;

// ─── Zod Schemas ─────────────────────────────────────────────────────────────

export const CreateJobSchema = z.object({
  body: z.object({
    type: z.string().min(1).max(255),
    priority: z.number().int().min(1).max(100).default(5),
    payload: z.record(z.any()).default({}),
    job_mode: z.enum(['immediate', 'delayed', 'scheduled']).default('immediate'),
    delay_ms: z.number().int().min(1).optional(),
    scheduled_at: z.string().datetime().optional(),
    idempotency_key: z.string().min(1).max(512).optional(),
    max_attempts: z.number().int().min(1).max(50).optional(),
  }).refine(data => {
    if (data.job_mode === 'delayed' && !data.delay_ms) return false;
    if (data.job_mode === 'scheduled' && !data.scheduled_at) return false;
    return true;
  }, {
    message: "delay_ms required for 'delayed', scheduled_at required for 'scheduled'",
    path: ['job_mode'],
  }),
});

export const BatchJobSchema = z.object({
  body: z.object({
    jobs: z.array(z.object({
      type: z.string().min(1).max(255),
      priority: z.number().int().min(1).max(100).default(5),
      payload: z.record(z.any()).default({}),
      idempotency_key: z.string().min(1).max(512).optional(),
      max_attempts: z.number().int().min(1).max(50).optional(),
    })).min(1).max(1000),
  }),
});

// ─── Access Helpers ──────────────────────────────────────────────────────────

async function verifyQueueAccess(queueId: string, userId: string): Promise<void> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT 1 FROM queues q
     JOIN projects p ON q.project_id = p.id
     JOIN organization_members om ON p.organization_id = om.organization_id
     WHERE q.id = $1 AND om.user_id = $2`,
    [queueId, userId],
  );
  if (rows.length === 0) {
    throw new AppError('Queue not found or unauthorized', 'NOT_FOUND', HttpStatus.NOT_FOUND);
  }
}

async function verifyJobAccess(jobId: string, userId: string): Promise<void> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT 1 FROM jobs j
     JOIN queues q ON j.queue_id = q.id
     JOIN projects p ON q.project_id = p.id
     JOIN organization_members om ON p.organization_id = om.organization_id
     WHERE j.id = $1 AND om.user_id = $2`,
    [jobId, userId],
  );
  if (rows.length === 0) {
    throw new AppError('Job not found or unauthorized', 'NOT_FOUND', HttpStatus.NOT_FOUND);
  }
}

/**
 * Returns the BullMQ Queue instance for enqueuing jobs.
 */
function getBullQueue(queueId: string): BullQueue {
  return new BullQueue(`atlas_${queueId}`, { connection: getRedis() });
}

/**
 * Fetch the queue's retry policy max_attempts to use as default for new jobs.
 */
async function getQueueMaxAttempts(queueId: string): Promise<number> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT rp.max_attempts
     FROM queues q
     JOIN retry_policies rp ON q.retry_policy_id = rp.id
     WHERE q.id = $1`,
    [queueId],
  );
  if (rows.length === 0) {
    return 3; // fallback default
  }
  return rows[0].max_attempts;
}

// ─── Pagination helper ───────────────────────────────────────────────────────

function parsePagination(query: Record<string, unknown>): { limit: number; offset: number } {
  const rawLimit = Number(query.limit) || DEFAULT_PAGE_LIMIT;
  const limit = Math.min(Math.max(1, rawLimit), MAX_PAGE_LIMIT);
  const offset = Math.max(0, Number(query.offset) || 0);
  return { limit, offset };
}

// ─── Endpoint Handlers ──────────────────────────────────────────────────────

/**
 * POST /queues/:queueId/jobs
 *
 * Submits a single job. Resolves status by job_mode:
 *   immediate → QUEUED  (available_at = NOW)
 *   delayed   → SCHEDULED (available_at = NOW + delay_ms)
 *   scheduled → SCHEDULED (available_at = scheduled_at)
 *
 * Idempotency: ON CONFLICT (idempotency_key) DO NOTHING.
 * On conflict returns the existing job with 409.
 */
export async function createJob(req: Request, res: Response, next: NextFunction) {
  const userId = req.user!.id;
  const queueId = req.params.queueId as string;

  try {
    await verifyQueueAccess(queueId, userId);

    const {
      type,
      priority,
      payload,
      job_mode,
      delay_ms,
      scheduled_at,
      idempotency_key,
      max_attempts: explicitMax,
    } = req.body;

    const defaultMax = await getQueueMaxAttempts(queueId);
    const maxAttempts = explicitMax ?? defaultMax;

    // Derive status and available_at from job_mode
    let status: string;
    let availableAt: Date;
    let scheduledAtTs: Date | null = null;

    switch (job_mode) {
      case 'immediate':
        status = 'QUEUED';
        availableAt = new Date();
        break;
      case 'delayed':
        status = 'SCHEDULED';
        availableAt = new Date(Date.now() + delay_ms);
        break;
      case 'scheduled':
        status = 'SCHEDULED';
        availableAt = new Date(scheduled_at);
        scheduledAtTs = new Date(scheduled_at);
        break;
      default:
        status = 'QUEUED';
        availableAt = new Date();
    }

    // Idempotent insert — ON CONFLICT DO NOTHING
    const insertResult = await getPool().query(
      `INSERT INTO jobs (
         id, queue_id, type, status, priority, payload,
         attempt_count, max_attempts, idempotency_key,
         available_at, scheduled_at, created_at, updated_at
       )
       VALUES (
         gen_random_uuid(), $1, $2, $3::text::"JobStatus", $4, $5,
         0, $6, $7,
         $8, $9, NOW(), NOW()
       )
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING id, queue_id, type, status, priority, payload,
                 attempt_count, max_attempts, idempotency_key,
                 available_at, scheduled_at, created_at`,
      [
        queueId, type, status, priority, JSON.stringify(payload),
        maxAttempts, idempotency_key || null,
        availableAt, scheduledAtTs,
      ],
    );

    // If nothing was inserted, the idempotency key already exists
    if (insertResult.rows.length === 0) {
      const { rows: [existing] } = await getPool().query(
        `SELECT id, queue_id, type, status, priority, payload,
                attempt_count, max_attempts, idempotency_key,
                available_at, scheduled_at, created_at
         FROM jobs WHERE idempotency_key = $1`,
        [idempotency_key],
      );
      return sendSuccess(res, existing, HttpStatus.CONFLICT);
    }

    const job = insertResult.rows[0];

    // Enqueue to BullMQ for immediate jobs; delayed jobs are promoted by the scheduler
    if (status === 'QUEUED') {
      const bullQueue = getBullQueue(queueId);
      await bullQueue.add(type, { jobId: job.id }, { jobId: job.id });
      await bullQueue.close();
    }

    sendSuccess(res, job, HttpStatus.CREATED);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /queues/:queueId/jobs/batch
 *
 * Submits multiple jobs atomically (single pg transaction, all or nothing).
 * All batch jobs are created as immediate (QUEUED).
 */
export async function createBatchJobs(req: Request, res: Response, next: NextFunction) {
  const userId = req.user!.id;
  const queueId = req.params.queueId as string;
  const pool = getPool();
  const client = await pool.connect();

  try {
    await verifyQueueAccess(queueId, userId);

    const { jobs: jobDefs } = req.body;
    const defaultMax = await getQueueMaxAttempts(queueId);

    await client.query('BEGIN');

    const createdJobs: Array<{ id: string; status: string; queue_id: string; type: string; payload: unknown }> = [];

    for (const def of jobDefs) {
      const maxAttempts = def.max_attempts ?? defaultMax;
      const { rows: [job] } = await client.query(
        `INSERT INTO jobs (
           id, queue_id, type, status, priority, payload,
           attempt_count, max_attempts, idempotency_key,
           available_at, created_at, updated_at
         )
         VALUES (
           gen_random_uuid(), $1, $2, 'QUEUED'::"JobStatus", $3, $4,
           0, $5, $6,
           NOW(), NOW(), NOW()
         )
         RETURNING id, status, queue_id, type, payload`,
        [queueId, def.type, def.priority, JSON.stringify(def.payload), maxAttempts, def.idempotency_key || null],
      );
      createdJobs.push(job);
    }

    await client.query('COMMIT');

    // Enqueue all to BullMQ outside the transaction (transport layer, not source of truth)
    const bullQueue = getBullQueue(queueId);
    for (const job of createdJobs) {
      await bullQueue.add(job.type, { jobId: job.id }, { jobId: job.id });
    }
    await bullQueue.close();

    sendSuccess(res, { created: createdJobs.length, jobs: createdJobs }, HttpStatus.CREATED);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => { /* rollback best-effort */ });
    if ((err as NodeJS.ErrnoException).code === '23505') {
      return next(new AppError('Duplicate idempotency key in batch', 'CONFLICT', HttpStatus.CONFLICT));
    }
    next(err);
  } finally {
    client.release();
  }
}

/**
 * GET /queues/:queueId/jobs
 *
 * Lists jobs in a queue with optional status/type filtering and pagination.
 */
export async function listJobs(req: Request, res: Response, next: NextFunction) {
  const userId = req.user!.id;
  const queueId = req.params.queueId as string;
  const pool = getPool();

  try {
    await verifyQueueAccess(queueId, userId);

    const { limit, offset } = parsePagination(req.query as Record<string, unknown>);
    const statusFilter = req.query.status as string | undefined;
    const typeFilter = req.query.type as string | undefined;

    const conditions = ['j.queue_id = $1'];
    const values: unknown[] = [queueId];
    let paramIdx = 2;

    if (statusFilter) {
      conditions.push(`j.status = $${paramIdx}::text::"JobStatus"`);
      values.push(statusFilter);
      paramIdx++;
    }
    if (typeFilter) {
      conditions.push(`j.type = $${paramIdx}`);
      values.push(typeFilter);
      paramIdx++;
    }

    const whereClause = conditions.join(' AND ');

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total FROM jobs j WHERE ${whereClause}`,
      values,
    );
    const total: number = countResult.rows[0].total;

    const dataValues = [...values, limit, offset];
    const { rows } = await pool.query(
      `SELECT j.id, j.type, j.status, j.priority, j.attempt_count, j.max_attempts,
              j.worker_id, j.available_at, j.scheduled_at, j.claimed_at,
              j.started_at, j.completed_at, j.created_at
       FROM   jobs j
       WHERE  ${whereClause}
       ORDER  BY j.created_at DESC
       LIMIT  $${paramIdx} OFFSET $${paramIdx + 1}`,
      dataValues,
    );

    sendPaginated(res, rows, total, limit, offset);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /jobs/:jobId
 *
 * Gets full detail of a single job including payload.
 */
export async function getJob(req: Request, res: Response, next: NextFunction) {
  const userId = req.user!.id;
  const jobId = req.params.jobId as string;
  const pool = getPool();

  try {
    await verifyJobAccess(jobId, userId);

    const { rows } = await pool.query(
      `SELECT id, queue_id, schedule_id, type, status, priority, payload,
              attempt_count, max_attempts, worker_id, idempotency_key,
              available_at, scheduled_at, claimed_at, started_at,
              completed_at, created_at, updated_at
       FROM   jobs
       WHERE  id = $1`,
      [jobId],
    );

    if (rows.length === 0) {
      throw new AppError('Job not found', 'NOT_FOUND', HttpStatus.NOT_FOUND);
    }

    sendSuccess(res, rows[0]);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /jobs/:jobId/executions
 *
 * Gets all execution attempts for a job, ordered by attempt_number ASC.
 */
export async function getJobExecutions(req: Request, res: Response, next: NextFunction) {
  const userId = req.user!.id;
  const jobId = req.params.jobId as string;
  const pool = getPool();

  try {
    await verifyJobAccess(jobId, userId);

    const { limit, offset } = parsePagination(req.query as Record<string, unknown>);

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total FROM job_executions WHERE job_id = $1`,
      [jobId],
    );
    const total: number = countResult.rows[0].total;

    const { rows } = await pool.query(
      `SELECT id, job_id, worker_id, attempt_number, status,
              error_code, error_message, result,
              started_at, completed_at,
              EXTRACT(EPOCH FROM (completed_at - started_at))::int * 1000 AS duration_ms
       FROM   job_executions
       WHERE  job_id = $1
       ORDER  BY attempt_number ASC
       LIMIT  $2 OFFSET $3`,
      [jobId, limit, offset],
    );

    sendPaginated(res, rows, total, limit, offset);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /jobs/:jobId/logs
 *
 * Gets structured logs for a job across all its executions.
 * Optional filters: execution_id, level.
 */
export async function getJobLogs(req: Request, res: Response, next: NextFunction) {
  const userId = req.user!.id;
  const jobId = req.params.jobId as string;
  const pool = getPool();

  try {
    await verifyJobAccess(jobId, userId);

    const { limit, offset } = parsePagination(req.query as Record<string, unknown>);
    const executionIdFilter = req.query.execution_id as string | undefined;
    const levelFilter = req.query.level as string | undefined;

    const conditions = ['l.job_id = $1'];
    const values: unknown[] = [jobId];
    let paramIdx = 2;

    if (executionIdFilter) {
      conditions.push(`l.execution_id = $${paramIdx}`);
      values.push(executionIdFilter);
      paramIdx++;
    }
    if (levelFilter) {
      conditions.push(`l.level = $${paramIdx}`);
      values.push(levelFilter);
      paramIdx++;
    }

    const whereClause = conditions.join(' AND ');

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total FROM job_logs l WHERE ${whereClause}`,
      values,
    );
    const total: number = countResult.rows[0].total;

    const dataValues = [...values, limit, offset];
    const { rows } = await pool.query(
      `SELECT l.id, l.job_id, l.execution_id, l.level, l.message, l.created_at
       FROM   job_logs l
       WHERE  ${whereClause}
       ORDER  BY l.created_at ASC
       LIMIT  $${paramIdx} OFFSET $${paramIdx + 1}`,
      dataValues,
    );

    sendPaginated(res, rows, total, limit, offset);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /jobs/:jobId/retry
 *
 * Manually retries a FAILED job — resets attempt count to 0, re-queues immediately.
 * State machine: only valid from FAILED → QUEUED.
 */
export async function retryJob(req: Request, res: Response, next: NextFunction) {
  const userId = req.user!.id;
  const jobId = req.params.jobId as string;
  const pool = getPool();

  try {
    await verifyJobAccess(jobId, userId);

    // Atomic transition: FAILED→QUEUED with state machine enforcement.
    // The conditional update re-checks status = 'FAILED' at UPDATE time,
    // preventing TOCTOU races where another process retries the same job.
    const updated = await transitionJobStatusConditional(
      pool,
      jobId,
      'FAILED',
      'QUEUED',
      {
        attempt_count: 0,
        available_at: new Date(),
        worker_id: null,
        claimed_at: null,
        started_at: null,
        completed_at: null,
      },
    );

    if (!updated) {
      throw new AppError(
        'Job not found or not in FAILED state',
        'INVALID_STATE_TRANSITION',
        HttpStatus.UNPROCESSABLE,
      );
    }

    // Re-enqueue to BullMQ
    const bullQueue = getBullQueue(updated.queue_id);
    await bullQueue.add(updated.type, { jobId }, { jobId });
    await bullQueue.close();

    sendSuccess(res, { id: updated.id, status: 'QUEUED' });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /jobs/:jobId/cancel
 *
 * Cancels a job. Only valid from SCHEDULED or QUEUED.
 * State machine: SCHEDULED → CANCELLED, QUEUED → CANCELLED.
 */
export async function cancelJob(req: Request, res: Response, next: NextFunction) {
  const userId = req.user!.id;
  const jobId = req.params.jobId as string;
  const pool = getPool();

  try {
    await verifyJobAccess(jobId, userId);

    // Determine current status to know which transition to attempt.
    const { rows: [job] } = await pool.query(
      `SELECT id, status FROM jobs WHERE id = $1`,
      [jobId],
    );
    if (!job) {
      throw new AppError('Job not found', 'NOT_FOUND', HttpStatus.NOT_FOUND);
    }

    // State machine allows: SCHEDULED→CANCELLED, QUEUED→CANCELLED
    // The atomic transition re-checks the status at UPDATE time.
    const updated = await transitionJobStatusConditional(
      pool,
      jobId,
      job.status,
      'CANCELLED',
    );

    if (!updated) {
      throw new AppError(
        'Job not in a cancellable state (must be SCHEDULED or QUEUED)',
        'INVALID_STATE_TRANSITION',
        HttpStatus.UNPROCESSABLE,
      );
    }

    sendSuccess(res, { id: updated.id, status: 'CANCELLED' });
  } catch (err) {
    next(err);
  }
}
