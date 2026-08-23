import type { Pool } from 'pg';

export async function moveToDLQ(
  pool: Pool,
  jobId: string,
  reason: string,
  errorMessage: string,
  attempts: number,
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE jobs SET status = 'FAILED', updated_at = NOW() WHERE id = $1`,
      [jobId],
    );
    await client.query(
      `INSERT INTO dead_letter_queue (id, job_id, reason, attempts, error_message, failed_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW())
       ON CONFLICT (job_id) DO NOTHING`,
      [jobId, reason, attempts, errorMessage],
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Re-creates the job from original payload and removes the DLQ entry — both in one transaction. */
export async function replayDLQEntry(
  pool: Pool,
  dlqEntryId: string,
): Promise<{ newJobId: string }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: [entry] } = await client.query(`
      SELECT d.id, d.job_id, j.queue_id, j.type, j.payload, j.priority, j.max_attempts
      FROM   dead_letter_queue d
      JOIN   jobs j ON j.id = d.job_id
      WHERE  d.id = $1
    `, [dlqEntryId]);

    if (!entry) throw new Error(`DLQ entry ${dlqEntryId} not found`);

    const { rows: [newJob] } = await client.query<{ id: string }>(`
      INSERT INTO jobs (id, queue_id, type, status, priority, payload, max_attempts,
                        attempt_count, available_at, created_at, updated_at)
      VALUES (gen_random_uuid(), $1, $2, 'QUEUED', $3, $4, $5, 0, NOW(), NOW(), NOW())
      RETURNING id
    `, [entry.queue_id, entry.type, entry.priority, entry.payload, entry.max_attempts]);

    await client.query(`DELETE FROM dead_letter_queue WHERE id = $1`, [dlqEntryId]);
    await client.query('COMMIT');
    return { newJobId: newJob.id };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
