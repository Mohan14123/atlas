import type { Pool, PoolClient } from 'pg';
import { validateTransition, type JobStatus } from '../../lib/stateMachine';

export interface JobRow {
  id: string;
  queue_id: string;
  type: string;
  status: JobStatus;
  payload: unknown;
  attempt_count: number;
  max_attempts: number;
  worker_id: string | null;
}

type Queryable = Pick<Pool | PoolClient, 'query'>;

/**
 * Atomically claim the next eligible job in a queue using FOR UPDATE SKIP LOCKED.
 * Returns null if nothing is claimable (paused queue, concurrency limit hit, or no QUEUED jobs).
 */
export async function claimNextJob(
  pool: Pool,
  queueId: string,
  workerId: string,
): Promise<JobRow | null> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query<JobRow>(`
      SELECT j.id, j.queue_id, j.type, j.status, j.payload, j.attempt_count, j.max_attempts, j.worker_id
      FROM   jobs   j
      JOIN   queues q ON q.id = j.queue_id
      WHERE  j.queue_id      = $1
        AND  j.status        = 'QUEUED'
        AND  j.available_at <= NOW()
        AND  q.is_paused     = false
        AND (
          SELECT COUNT(*) FROM jobs
          WHERE  queue_id = $1 AND status = 'RUNNING'
        ) < q.concurrency_limit
      ORDER  BY j.priority DESC, j.available_at ASC
      LIMIT  1
      FOR UPDATE OF j SKIP LOCKED
    `, [queueId]);

    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return null;
    }

    const job = rows[0];
    await client.query(`
      WITH updated AS (
        UPDATE jobs
        SET    status = 'CLAIMED', worker_id = $2, claimed_at = NOW(), updated_at = NOW()
        WHERE  id = $1
        RETURNING id
      ),
      log AS (
        INSERT INTO job_logs (id, job_id, level, message)
        SELECT gen_random_uuid(), id, 'INFO', 'Status transitioned from QUEUED to CLAIMED'
        FROM updated
        RETURNING id
      )
      SELECT pg_notify('job_updated', json_build_object('job_id', id, 'status', 'CLAIMED')::text)
      FROM updated
    `, [job.id, workerId]);

    await client.query('COMMIT');
    return { ...job, status: 'CLAIMED', worker_id: workerId };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Atomically claim a specific job by ID using pessimistic locking.
 * Enforces queue paused status, job QUEUED status, and concurrency limits.
 * Returns null if the job is already claimed, completed, or unclaimable.
 */
export async function claimSpecificJob(
  pool: Pool,
  jobId: string,
  workerId: string,
): Promise<JobRow | null> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query<JobRow>(`
      SELECT j.id, j.queue_id, j.type, j.status, j.payload, j.attempt_count, j.max_attempts, j.worker_id
      FROM   jobs   j
      JOIN   queues q ON q.id = j.queue_id
      WHERE  j.id            = $1
        AND  j.status        = 'QUEUED'
        AND  q.is_paused     = false
        AND (
          SELECT COUNT(*) FROM jobs
          WHERE  queue_id = j.queue_id AND status = 'RUNNING'
        ) < q.concurrency_limit
      FOR UPDATE OF j SKIP LOCKED
    `, [jobId]);

    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return null;
    }

    const job = rows[0];
    await client.query(`
      WITH updated AS (
        UPDATE jobs
        SET    status = 'CLAIMED', worker_id = $2, claimed_at = NOW(), updated_at = NOW()
        WHERE  id = $1
        RETURNING id
      ),
      log AS (
        INSERT INTO job_logs (id, job_id, level, message)
        SELECT gen_random_uuid(), id, 'INFO', 'Status transitioned from QUEUED to CLAIMED'
        FROM updated
        RETURNING id
      )
      SELECT pg_notify('job_updated', json_build_object('job_id', id, 'status', 'CLAIMED')::text)
      FROM updated
    `, [job.id, workerId]);

    await client.query('COMMIT');
    return { ...job, status: 'CLAIMED', worker_id: workerId };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Validate and apply a status transition, optionally patching timestamp columns.
 * Throws if the job is not in the expected `from` state (concurrent claim guard).
 */
export async function transitionJobStatus(
  db: Queryable,
  jobId: string,
  from: JobStatus,
  to: JobStatus,
  patch: Partial<Record<string, unknown>> = {},
): Promise<void> {
  validateTransition(from, to);

  const sets = ['status = $2', 'updated_at = NOW()'];
  const vals: unknown[] = [jobId, to];

  for (const [col, val] of Object.entries(patch)) {
    vals.push(val);
    sets.push(`${col} = $${vals.length}`);
  }

  vals.push(from);
  const { rowCount } = await db.query(`
    WITH updated AS (
      UPDATE jobs SET ${sets.join(', ')} WHERE id = $1 AND status = $${vals.length}
      RETURNING id
    ),
    log AS (
      INSERT INTO job_logs (id, job_id, level, message)
      SELECT gen_random_uuid(), id, 'INFO', 'Status transitioned from ' || $${vals.length} || ' to ' || $2
      FROM updated
      RETURNING id
    )
    SELECT pg_notify('job_updated', json_build_object('job_id', id, 'status', $2)::text)
    FROM updated
  `, vals);

  if ((rowCount ?? 0) === 0) {
    throw new Error(`Job ${jobId} not in expected status '${from}' — possible concurrent claim`);
  }
}

/**
 * Atomically transition a single job identified by ID, enforcing a conditional
 * WHERE clause beyond the `from` status check. Returns the updated row or null
 * if no row matched (e.g. concurrent update). Unlike `transitionJobStatus`,
 * this returns data instead of throwing on zero rows — callers can decide
 * whether zero-match is an error or expected concurrency outcome.
 *
 * Validates the state machine, writes a transition log, and emits pg_notify.
 */
export async function transitionJobStatusConditional(
  db: Queryable,
  jobId: string,
  from: JobStatus,
  to: JobStatus,
  patch: Partial<Record<string, unknown>> = {},
  extraCondition?: string,
  extraParams?: unknown[],
): Promise<{ id: string; queue_id: string; type: string; payload: unknown } | null> {
  validateTransition(from, to);

  const sets = ['status = $2', 'updated_at = NOW()'];
  const vals: unknown[] = [jobId, to];

  for (const [col, val] of Object.entries(patch)) {
    vals.push(val);
    sets.push(`${col} = $${vals.length}`);
  }

  vals.push(from);
  const fromIdx = vals.length;

  let condition = `id = $1 AND status = $${fromIdx}`;
  if (extraCondition && extraParams) {
    for (const param of extraParams) {
      vals.push(param);
    }
    condition += ` AND ${extraCondition}`;
  }

  const { rows } = await db.query<{ id: string; queue_id: string; type: string; payload: unknown }>(`
    WITH updated AS (
      UPDATE jobs SET ${sets.join(', ')} WHERE ${condition}
      RETURNING id, queue_id, type, payload
    ),
    log AS (
      INSERT INTO job_logs (id, job_id, level, message)
      SELECT gen_random_uuid(), id, 'INFO', 'Status transitioned from ' || $${fromIdx} || ' to ' || $2
      FROM updated
      RETURNING id
    )
    SELECT u.id, u.queue_id, u.type, u.payload,
           pg_notify('job_updated', json_build_object('job_id', u.id, 'status', $2)::text)
    FROM updated u
  `, vals);

  return rows.length > 0 ? rows[0] : null;
}

