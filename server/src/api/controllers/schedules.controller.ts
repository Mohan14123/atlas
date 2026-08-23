import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { getPool } from '../../shared/config/db';
import { sendSuccess } from '../../shared/lib/response';
import { AppError, HttpStatus } from '../../shared/lib/errors';
import { getNextRunAt } from '../../shared/lib/cron';

export const CreateScheduleSchema = z.object({
  body: z.object({
    schedule_type: z.enum(['cron', 'once']),
    cron_expression: z.string().optional(),
    timezone: z.string().default('UTC'),
    job_type: z.string().min(1).max(255),
    job_priority: z.number().int().min(1).default(5),
    job_payload: z.record(z.any()).default({}),
    enabled: z.boolean().default(true),
    next_run_at: z.string().datetime().optional()
  }).refine(data => {
    if (data.schedule_type === 'cron' && !data.cron_expression) return false;
    if (data.schedule_type === 'once' && !data.next_run_at) return false;
    return true;
  }, {
    message: "cron_expression is required for 'cron', next_run_at is required for 'once'",
    path: ['schedule_type']
  })
});

export const UpdateScheduleSchema = z.object({
  body: z.object({
    schedule_type: z.enum(['cron', 'once']).optional(),
    cron_expression: z.string().optional(),
    timezone: z.string().optional(),
    job_type: z.string().min(1).max(255).optional(),
    job_priority: z.number().int().min(1).optional(),
    job_payload: z.record(z.any()).optional(),
    enabled: z.boolean().optional(),
    next_run_at: z.string().datetime().optional()
  })
});

async function verifyQueueAccess(queueId: string, userId: string): Promise<void> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT 1 FROM queues q
     JOIN projects p ON q.project_id = p.id
     JOIN organization_members om ON p.organization_id = om.organization_id
     WHERE q.id = $1 AND om.user_id = $2`,
    [queueId, userId]
  );
  if (rows.length === 0) {
    throw new AppError('Queue not found or unauthorized', 'NOT_FOUND', HttpStatus.NOT_FOUND);
  }
}

async function verifyScheduleAccess(scheduleId: string, userId: string): Promise<void> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT 1 FROM job_schedules s
     JOIN queues q ON s.queue_id = q.id
     JOIN projects p ON q.project_id = p.id
     JOIN organization_members om ON p.organization_id = om.organization_id
     WHERE s.id = $1 AND om.user_id = $2`,
    [scheduleId, userId]
  );
  if (rows.length === 0) {
    throw new AppError('Schedule not found or unauthorized', 'NOT_FOUND', HttpStatus.NOT_FOUND);
  }
}

export async function createSchedule(req: Request, res: Response, next: NextFunction) {
  const userId = req.user!.id;
  const queueId = req.params.queueId as string;
  const pool = getPool();

  try {
    await verifyQueueAccess(queueId, userId);

    const {
      schedule_type,
      cron_expression,
      timezone,
      job_type,
      job_priority,
      job_payload,
      enabled,
      next_run_at: explicit_next_run_at
    } = req.body;

    let computedNextRunAt = explicit_next_run_at ? new Date(explicit_next_run_at) : null;
    
    if (schedule_type === 'cron' && cron_expression) {
      computedNextRunAt = getNextRunAt(cron_expression, timezone);
    }

    const { rows } = await pool.query(
      `INSERT INTO job_schedules (
         id, queue_id, schedule_type, cron_expression, timezone,
         job_type, job_priority, job_payload, next_run_at, enabled, created_at
       )
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
       RETURNING id, queue_id, schedule_type, cron_expression, timezone,
                 job_type, job_priority, job_payload, next_run_at, enabled, created_at`,
      [
        queueId,
        schedule_type,
        cron_expression || null,
        timezone,
        job_type,
        job_priority,
        job_payload,
        computedNextRunAt,
        enabled
      ]
    );

    sendSuccess(res, { schedule: rows[0] }, HttpStatus.CREATED);
  } catch (err) {
    next(err);
  }
}

export async function listSchedules(req: Request, res: Response, next: NextFunction) {
  const userId = req.user!.id;
  const queueId = req.params.queueId as string;
  const pool = getPool();

  try {
    await verifyQueueAccess(queueId, userId);

    const { rows } = await pool.query(
      `SELECT id, queue_id, schedule_type, cron_expression, timezone,
              job_type, job_priority, job_payload, next_run_at, last_run_at, enabled, created_at
       FROM job_schedules
       WHERE queue_id = $1
       ORDER BY created_at DESC`,
      [queueId]
    );

    sendSuccess(res, { schedules: rows });
  } catch (err) {
    next(err);
  }
}

export async function getSchedule(req: Request, res: Response, next: NextFunction) {
  const userId = req.user!.id;
  const scheduleId = req.params.scheduleId as string;
  const pool = getPool();

  try {
    await verifyScheduleAccess(scheduleId, userId);

    const { rows } = await pool.query(
      `SELECT id, queue_id, schedule_type, cron_expression, timezone,
              job_type, job_priority, job_payload, next_run_at, last_run_at, enabled, created_at
       FROM job_schedules
       WHERE id = $1`,
      [scheduleId]
    );

    if (rows.length === 0) {
      throw new AppError('Schedule not found', 'NOT_FOUND', HttpStatus.NOT_FOUND);
    }

    sendSuccess(res, { schedule: rows[0] });
  } catch (err) {
    next(err);
  }
}

export async function updateSchedule(req: Request, res: Response, next: NextFunction) {
  const userId = req.user!.id;
  const scheduleId = req.params.scheduleId as string;
  const pool = getPool();

  try {
    await verifyScheduleAccess(scheduleId, userId);

    // Fetch existing schedule
    const { rows: existingRows } = await pool.query(
      `SELECT schedule_type, cron_expression, timezone, next_run_at
       FROM job_schedules
       WHERE id = $1`,
      [scheduleId]
    );
    
    if (existingRows.length === 0) {
      throw new AppError('Schedule not found', 'NOT_FOUND', HttpStatus.NOT_FOUND);
    }
    const existing = existingRows[0];

    const updates = req.body;
    if (Object.keys(updates).length === 0) {
      return sendSuccess(res, { message: 'No updates provided' });
    }

    // Determine new values for computation
    const newScheduleType = updates.schedule_type ?? existing.schedule_type;
    const newCronExp = updates.cron_expression !== undefined ? updates.cron_expression : existing.cron_expression;
    const newTimezone = updates.timezone ?? existing.timezone;
    let newNextRunAt = updates.next_run_at ? new Date(updates.next_run_at) : existing.next_run_at;

    if (newScheduleType === 'cron' && (updates.cron_expression || updates.timezone)) {
      if (!newCronExp) {
        throw new AppError('cron_expression is required for cron schedules', 'VALIDATION_ERROR', HttpStatus.BAD_REQUEST);
      }
      newNextRunAt = getNextRunAt(newCronExp, newTimezone);
    }

    const setClauses: string[] = [];
    const values: any[] = [scheduleId];
    let paramIndex = 2;

    if (updates.schedule_type !== undefined) {
      setClauses.push(\`schedule_type = $\${paramIndex++}\`);
      values.push(updates.schedule_type);
    }
    if (updates.cron_expression !== undefined) {
      setClauses.push(\`cron_expression = $\${paramIndex++}\`);
      values.push(updates.cron_expression);
    }
    if (updates.timezone !== undefined) {
      setClauses.push(\`timezone = $\${paramIndex++}\`);
      values.push(updates.timezone);
    }
    if (updates.job_type !== undefined) {
      setClauses.push(\`job_type = $\${paramIndex++}\`);
      values.push(updates.job_type);
    }
    if (updates.job_priority !== undefined) {
      setClauses.push(\`job_priority = $\${paramIndex++}\`);
      values.push(updates.job_priority);
    }
    if (updates.job_payload !== undefined) {
      setClauses.push(\`job_payload = $\${paramIndex++}\`);
      values.push(updates.job_payload);
    }
    if (updates.enabled !== undefined) {
      setClauses.push(\`enabled = $\${paramIndex++}\`);
      values.push(updates.enabled);
    }
    
    // Always update next_run_at if it was computed or provided
    setClauses.push(\`next_run_at = $\${paramIndex++}\`);
    values.push(newNextRunAt);

    const { rows } = await pool.query(
      \`UPDATE job_schedules
       SET \${setClauses.join(', ')}
       WHERE id = $1
       RETURNING id, queue_id, schedule_type, cron_expression, timezone,
                 job_type, job_priority, job_payload, next_run_at, last_run_at, enabled, created_at\`,
      values
    );

    sendSuccess(res, { schedule: rows[0] });
  } catch (err) {
    next(err);
  }
}

export async function deleteSchedule(req: Request, res: Response, next: NextFunction) {
  const userId = req.user!.id;
  const scheduleId = req.params.scheduleId as string;
  const pool = getPool();

  try {
    await verifyScheduleAccess(scheduleId, userId);

    const { rowCount } = await pool.query(
      \`DELETE FROM job_schedules WHERE id = $1\`,
      [scheduleId]
    );

    if (rowCount === 0) {
      throw new AppError('Schedule not found', 'NOT_FOUND', HttpStatus.NOT_FOUND);
    }

    sendSuccess(res, { message: 'Schedule deleted successfully' });
  } catch (err) {
    next(err);
  }
}
