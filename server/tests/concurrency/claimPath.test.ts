import { getPool, closePool } from '../../src/shared/config/db';
import { claimSpecificJob, claimNextJob } from '../../src/shared/db/queries/jobs';
import crypto from 'crypto';

describe('Concurrency - Job Claiming', () => {
  const pool = getPool();
  let orgId: string;
  let projectId: string;
  let queueId: string;

  beforeAll(async () => {
    // Setup org, project, and queue directly in DB to bypass API overhead
    const orgRes = await pool.query(
      `INSERT INTO organizations (id, name, created_at) VALUES (gen_random_uuid(), 'ConcurrencyOrg', NOW()) RETURNING id`
    );
    orgId = orgRes.rows[0].id;

    const projRes = await pool.query(
      `INSERT INTO projects (id, organization_id, name, created_at) VALUES (gen_random_uuid(), $1, 'ConcurrencyProj', NOW()) RETURNING id`,
      [orgId]
    );
    projectId = projRes.rows[0].id;

    const retryRes = await pool.query(
      `INSERT INTO retry_policies (id, max_attempts, strategy, initial_delay_ms, max_delay_ms) VALUES (gen_random_uuid(), 3, 'fixed', 1000, 5000) RETURNING id`
    );

    const queueRes = await pool.query(
      `INSERT INTO queues (id, project_id, name, concurrency_limit, retry_policy_id, created_at) VALUES (gen_random_uuid(), $1, 'concurrent-q', 100, $2, NOW()) RETURNING id`,
      [projectId, retryRes.rows[0].id]
    );
    queueId = queueRes.rows[0].id;

    // We will use 30 workers in total across tests
    const workerIds = Array.from({ length: 30 }, () => crypto.randomUUID());
    for (const wid of workerIds) {
      await pool.query(
        `INSERT INTO workers (id, hostname, status, concurrency, registered_at) VALUES ($1, 'testhost', 'active', 5, NOW())`,
        [wid]
      );
    }
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM organizations WHERE id = $1`, [orgId]);
    await pool.query(`DELETE FROM workers WHERE hostname = 'testhost'`);
    await closePool();
  });

  it('should ensure exactly one worker claims a job when multiple workers attempt to claim the same job ID', async () => {
    const { rows } = await pool.query(
      `INSERT INTO jobs (id, queue_id, type, status, priority, payload, attempt_count, max_attempts, available_at, created_at, updated_at) 
       VALUES (gen_random_uuid(), $1, 'test-task', 'QUEUED', 5, '{}', 0, 3, NOW(), NOW(), NOW()) 
       RETURNING id`,
      [queueId]
    );
    const jobId = rows[0].id;

    const { rows: workers } = await pool.query(`SELECT id FROM workers WHERE hostname = 'testhost' LIMIT 10`);
    const workerIds = workers.map((w: any) => w.id);

    // 10 workers try to claim the same job at the same time
    const results = await Promise.allSettled(
      workerIds.map(workerId => claimSpecificJob(pool, jobId, workerId))
    );

    let successfulClaims = 0;
    let nullReturns = 0;

    for (const result of results) {
      if (result.status === 'fulfilled') {
        if (result.value !== null) successfulClaims++;
        else nullReturns++;
      }
    }

    expect(successfulClaims).toBe(1);
    expect(nullReturns).toBe(9);

    // Verify DB state
    const jobState = await pool.query(`SELECT status, worker_id FROM jobs WHERE id = $1`, [jobId]);
    expect(jobState.rows[0].status).toBe('CLAIMED');
    expect(workerIds).toContain(jobState.rows[0].worker_id);
  });

  it('should allow N workers to claim exactly M jobs without duplicates when calling claimNextJob', async () => {
    // Insert 50 jobs
    const jobsToInsert = Array.from({ length: 50 }, (_, i) => [
      queueId, 'test-task', 'QUEUED', 5, `{"index": ${i}}`, 0, 3
    ]);

    for (const job of jobsToInsert) {
      await pool.query(
        `INSERT INTO jobs (id, queue_id, type, status, priority, payload, attempt_count, max_attempts, available_at, created_at, updated_at) 
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, NOW(), NOW(), NOW())`,
        job
      );
    }

    const { rows: workers } = await pool.query(`SELECT id FROM workers WHERE hostname = 'testhost' LIMIT 20`);
    const workerIds = workers.map((w: any) => w.id);
    
    // Each of the 20 workers tries to pull 5 times concurrently = 100 claim attempts
    const attempts = [];
    for (let i = 0; i < 5; i++) {
      for (const workerId of workerIds) {
        attempts.push(claimNextJob(pool, queueId, workerId));
      }
    }

    const results = await Promise.allSettled(attempts);

    const claimedJobIds = new Set<string>();
    let successfulClaims = 0;

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value !== null) {
        successfulClaims++;
        claimedJobIds.add(result.value.id);
      }
    }

    // 50 jobs were available, so exactly 50 should be claimed
    expect(successfulClaims).toBe(50);
    expect(claimedJobIds.size).toBe(50);
  });
});
