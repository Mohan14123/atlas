import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { getPool } from '../../shared/config/db';
import { sendSuccess } from '../../shared/lib/response';
import { AppError, HttpStatus } from '../../shared/lib/errors';

export const CreateQueueSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(255),
    concurrency_limit: z.number().int().min(1).optional(),
    is_paused: z.boolean().optional(),
  }),
});

export const UpdateQueueSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(255).optional(),
    concurrency_limit: z.number().int().min(1).optional(),
    is_paused: z.boolean().optional(),
  }),
});

// Verifies that the user has access to the project's organization
async function verifyProjectAccess(projectId: string, userId: string): Promise<void> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT 1 FROM projects p
     JOIN organization_members om ON p.organization_id = om.organization_id
     WHERE p.id = $1 AND om.user_id = $2`,
    [projectId, userId]
  );
  if (rows.length === 0) {
    throw new AppError('Project not found or unauthorized', 'NOT_FOUND', HttpStatus.NOT_FOUND);
  }
}

export async function listQueues(req: Request, res: Response, next: NextFunction) {
  const userId = req.user!.id;
  const projectId = req.params.projectId as string;
  const pool = getPool();

  try {
    await verifyProjectAccess(projectId, userId);

    const { rows } = await pool.query(
      `SELECT id, project_id, name, concurrency_limit, is_paused, created_at
       FROM   queues
       WHERE  project_id = $1
       ORDER  BY created_at DESC`,
      [projectId]
    );

    sendSuccess(res, { queues: rows });
  } catch (err) {
    next(err);
  }
}

export async function createQueue(req: Request, res: Response, next: NextFunction) {
  const userId = req.user!.id;
  const projectId = req.params.projectId as string;
  const { name, concurrency_limit = 10, is_paused = false } = req.body;
  const pool = getPool();
  const client = await pool.connect();

  try {
    await verifyProjectAccess(projectId, userId);

    await client.query('BEGIN');

    // Create a default retry policy
    const { rows: [retryPolicy] } = await client.query(
      `INSERT INTO retry_policies (id, strategy, max_attempts, initial_delay_ms, max_delay_ms)
       VALUES (gen_random_uuid(), 'exponential', 3, 1000, 60000)
       RETURNING id`
    );

    const { rows: [queue] } = await client.query(
      `INSERT INTO queues (id, project_id, retry_policy_id, name, concurrency_limit, is_paused, created_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW())
       RETURNING id, project_id, name, concurrency_limit, is_paused, created_at`,
      [projectId, retryPolicy.id, name, concurrency_limit, is_paused]
    );

    await client.query('COMMIT');
    sendSuccess(res, { queue }, HttpStatus.CREATED);
  } catch (err) {
    await client.query('ROLLBACK');
    if ((err as any).code === '23505') { // unique_violation
      return next(new AppError('Queue name must be unique within the project', 'CONFLICT', HttpStatus.CONFLICT));
    }
    next(err);
  } finally {
    client.release();
  }
}

export async function getQueue(req: Request, res: Response, next: NextFunction) {
  const userId = req.user!.id;
  const projectId = req.params.projectId as string;
  const queueId = req.params.queueId as string;
  const pool = getPool();

  try {
    await verifyProjectAccess(projectId, userId);

    const { rows: [queue] } = await pool.query(
      `SELECT id, project_id, name, concurrency_limit, is_paused, created_at
       FROM   queues
       WHERE  project_id = $1 AND id = $2`,
      [projectId, queueId]
    );

    if (!queue) {
      throw new AppError('Queue not found', 'NOT_FOUND', HttpStatus.NOT_FOUND);
    }

    sendSuccess(res, { queue });
  } catch (err) {
    next(err);
  }
}

export async function updateQueue(req: Request, res: Response, next: NextFunction) {
  const userId = req.user!.id;
  const projectId = req.params.projectId as string;
  const queueId = req.params.queueId as string;
  const { name, concurrency_limit, is_paused } = req.body;
  const pool = getPool();

  try {
    await verifyProjectAccess(projectId, userId);

    const { rows: [queue] } = await pool.query(
      `UPDATE queues
       SET    name = COALESCE($1, name),
              concurrency_limit = COALESCE($2, concurrency_limit),
              is_paused = COALESCE($3, is_paused)
       WHERE  project_id = $4 AND id = $5
       RETURNING id, project_id, name, concurrency_limit, is_paused, created_at`,
      [name, concurrency_limit, is_paused, projectId, queueId]
    );

    if (!queue) {
      throw new AppError('Queue not found', 'NOT_FOUND', HttpStatus.NOT_FOUND);
    }

    sendSuccess(res, { queue });
  } catch (err) {
    if ((err as any).code === '23505') {
      return next(new AppError('Queue name must be unique within the project', 'CONFLICT', HttpStatus.CONFLICT));
    }
    next(err);
  }
}

export async function deleteQueue(req: Request, res: Response, next: NextFunction) {
  const userId = req.user!.id;
  const projectId = req.params.projectId as string;
  const queueId = req.params.queueId as string;
  const pool = getPool();

  try {
    await verifyProjectAccess(projectId, userId);

    const { rowCount } = await pool.query(
      `DELETE FROM queues WHERE project_id = $1 AND id = $2`,
      [projectId, queueId]
    );

    if (rowCount === 0) {
      throw new AppError('Queue not found', 'NOT_FOUND', HttpStatus.NOT_FOUND);
    }

    sendSuccess(res, { message: 'Queue deleted successfully' });
  } catch (err) {
    next(err);
  }
}
