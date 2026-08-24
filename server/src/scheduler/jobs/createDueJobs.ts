import { getPool } from '../../shared/config/db';
import { getBullMQManager } from '../../shared/lib/bullmq-manager';
import { getNextRunAt } from '../../shared/lib/cron';
import { findDueSchedules } from '../../shared/db/queries/schedules';
import { logger } from '../../shared/lib/logger';

export async function createDueJobs() {
  const pool = getPool();
  try {
    const dueSchedules = await findDueSchedules(pool);

    for (const schedule of dueSchedules) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // 1. Lock the schedule row
        const { rows } = await client.query(`
          SELECT id, cron_expression, timezone, next_run_at, schedule_type
          FROM job_schedules
          WHERE id = $1
          FOR UPDATE
        `, [schedule.id]);

        if (rows.length === 0) {
          await client.query('ROLLBACK');
          continue;
        }

        const lockedSchedule = rows[0];

        // 2. Re-check if still due
        if (!lockedSchedule.next_run_at || lockedSchedule.next_run_at.getTime() > Date.now()) {
          await client.query('ROLLBACK');
          continue;
        }

        const currentOccurrenceTime = lockedSchedule.next_run_at;
        
        // 3. Calculate the next run time
        let newNextRunAt: Date | null = null;
        if (lockedSchedule.schedule_type === 'cron' && lockedSchedule.cron_expression) {
          try {
            // We need to calculate the next run relative to the current logical occurrence, 
            // not Date.now(), to avoid drift, but parser.parse is stateful or relies on current time.
            // Using our shared lib:
            newNextRunAt = getNextRunAt(lockedSchedule.cron_expression, lockedSchedule.timezone);
          } catch (err: any) {
            logger.error(`Failed to parse cron for schedule ${schedule.id}`, { error: err.message, service: 'scheduler' });
            // If cron is fundamentally broken, disable schedule to prevent infinite failure loops
            await client.query('UPDATE job_schedules SET enabled = false WHERE id = $1', [schedule.id]);
            await client.query('COMMIT');
            continue;
          }
        }

        // 4. Create uniqueness token using existing idempotency_key column
        const idempotencyKey = `sched:${schedule.id}:${currentOccurrenceTime.toISOString()}`;

        // 5. Insert the job (Using ON CONFLICT DO NOTHING to ensure exactly-once generation for this occurrence)
        const { rows: jobRows } = await client.query<{ id: string }>(`
          INSERT INTO jobs (id, queue_id, schedule_id, type, status, priority, payload, attempt_count, max_attempts, idempotency_key, available_at, scheduled_at, created_at, updated_at)
          VALUES (gen_random_uuid(), $1, $2, $3, 'QUEUED', $4, $5, 0, 3, $6, NOW(), $7, NOW(), NOW())
          ON CONFLICT (idempotency_key) DO NOTHING
          RETURNING id
        `, [
          schedule.queue_id,
          schedule.id,
          schedule.job_type,
          schedule.job_priority,
          schedule.job_payload,
          idempotencyKey,
          currentOccurrenceTime // stored as scheduled_at
        ]);

        // 6. Update the schedule's next_run_at
        await client.query(`
          UPDATE job_schedules
          SET last_run_at = next_run_at,
              next_run_at = $2
          WHERE id = $1
        `, [schedule.id, newNextRunAt]);

        await client.query('COMMIT');

        // 7. Enqueue to BullMQ if job was actually inserted
        if (jobRows.length === 1) {
          const jobId = jobRows[0].id;
          await getBullMQManager().enqueue(schedule.queue_id, schedule.job_type, jobId);

          logger.info(`Generated job ${jobId} for schedule ${schedule.id}`, {
            service: 'scheduler',
            job_id: jobId,
            schedule_id: schedule.id
          });
        }
      } catch (err: any) {
        await client.query('ROLLBACK');
        logger.error(`Failed to process schedule ${schedule.id}`, { error: err.message, service: 'scheduler' });
      } finally {
        client.release();
      }
    }
  } catch (err: any) {
    logger.error('Failed in createDueJobs', { error: err.message, service: 'scheduler' });
    throw err;
  }
}
