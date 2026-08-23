import type { Pool } from 'pg';

export interface ScheduleRow {
  id: string;
  queue_id: string;
  job_type: string;
  job_priority: number;
  job_payload: unknown;
  cron_expression: string | null;
  timezone: string;
  next_run_at: Date | null;
}

/** Returns enabled schedules whose next_run_at is due. */
export async function findDueSchedules(pool: Pool): Promise<ScheduleRow[]> {
  const { rows } = await pool.query<ScheduleRow>(`
    SELECT id, queue_id, job_type, job_priority, job_payload, cron_expression, timezone, next_run_at
    FROM   job_schedules
    WHERE  enabled = true
      AND  next_run_at <= NOW()
    ORDER  BY next_run_at ASC
    LIMIT  100
  `);
  return rows;
}

export async function updateNextRunAt(
  pool: Pool,
  scheduleId: string,
  nextRunAt: Date | null,
): Promise<void> {
  await pool.query(
    `UPDATE job_schedules
     SET    last_run_at = next_run_at, next_run_at = $2
     WHERE  id = $1`,
    [scheduleId, nextRunAt],
  );
}
