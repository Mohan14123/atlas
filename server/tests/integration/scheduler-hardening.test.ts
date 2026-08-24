import { getPool, closePool } from '../../src/shared/config/db';
import { getRedis, closeRedis } from '../../src/shared/config/redis';
import { createDueJobs } from '../../src/scheduler/jobs/createDueJobs';
import { promoteDelayedJobs } from '../../src/scheduler/jobs/promoteDelayedJobs';
import { reconcile } from '../../src/scheduler/jobs/reconcile';
import { claimSpecificJob, claimNextJob } from '../../src/shared/db/queries/jobs';
import { closeBullMQManager } from '../../src/shared/lib/bullmq-manager';

/**
 * Integration tests for scheduler duplication prevention, concurrency enforcement,
 * and multi-scheduler safety.
 */
describe('Scheduler & Concurrency Hardening', () => {
  const uid = Date.now().toString();
  const queueId = 'sched-q-' + uid;
  const retryPolicyId = 'sched-rp-' + uid;
  const projectId = 'sched-proj-' + uid;
  const orgId = 'sched-org-' + uid;

  beforeAll(async () => {
    const pool = getPool();
    await pool.query(`INSERT INTO organizations (id, name) VALUES ($1, 'Sched Org')`, [orgId]);
    await pool.query(`INSERT INTO projects (id, organization_id, name) VALUES ($1, $2, 'Sched Proj')`, [projectId, orgId]);
    await pool.query(`INSERT INTO retry_policies (id, strategy, max_attempts) VALUES ($1, 'fixed', 3)`, [retryPolicyId]);
    await pool.query(`INSERT INTO queues (id, project_id, retry_policy_id, name, concurrency_limit) VALUES ($1, $2, $3, 'Sched Queue', 100)`, [queueId, projectId, retryPolicyId]);
  });

  afterAll(async () => {
    const pool = getPool();
    await pool.query(`DELETE FROM organizations WHERE id = $1`, [orgId]);
    await closeBullMQManager();
    await closePool();
    await closeRedis();
  });

  afterEach(async () => {
    const pool = getPool();
    await pool.query(`DELETE FROM jobs WHERE queue_id = $1`, [queueId]);
    await pool.query(`DELETE FROM job_schedules WHERE queue_id = $1`, [queueId]);
  });

  /**
   * Multiple concurrent scheduler instances calling createDueJobs should
   * produce exactly one job per schedule occurrence (idempotency key).
   */
  it('concurrent createDueJobs calls should not create duplicate jobs', async () => {
    const pool = getPool();

    // Create a due schedule
    await pool.query(`
      INSERT INTO job_schedules (id, queue_id, schedule_type, cron_expression, timezone, job_type, next_run_at)
      VALUES (gen_random_uuid(), $1, 'cron', '* * * * *', 'UTC', 'test', NOW() - interval '10 seconds')
    `, [queueId]);

    // Simulate 5 concurrent scheduler instances
    await Promise.all([
      createDueJobs(),
      createDueJobs(),
      createDueJobs(),
      createDueJobs(),
      createDueJobs(),
    ]);

    // Should produce exactly 1 job (idempotency key prevents duplicates)
    const { rows: jobs } = await pool.query(`SELECT id FROM jobs WHERE queue_id = $1`, [queueId]);
    expect(jobs.length).toBe(1);
  });

  /**
   * Concurrent promoteDelayedJobs should not produce duplicate transitions
   * (the conditional UPDATE with AND status = 'SCHEDULED' ensures at most one succeeds).
   */
  it('concurrent promoteDelayedJobs should promote exactly once', async () => {
    const pool = getPool();

    // Create a SCHEDULED job that's due
    const { rows: [job] } = await pool.query<{ id: string }>(`
      INSERT INTO jobs (id, queue_id, type, status, attempt_count, max_attempts, available_at, created_at, updated_at)
      VALUES (gen_random_uuid(), $1, 'test', 'SCHEDULED', 0, 3, NOW() - interval '5 seconds', NOW(), NOW())
      RETURNING id
    `, [queueId]);

    // Simulate concurrent promotions
    await Promise.all([
      promoteDelayedJobs(),
      promoteDelayedJobs(),
      promoteDelayedJobs(),
    ]);

    // Job should be QUEUED exactly once
    const { rows: [result] } = await pool.query(`SELECT status FROM jobs WHERE id = $1`, [job.id]);
    expect(result.status).toBe('QUEUED');
  });

  /**
   * Paused queues should block job claiming.
   */
  it('should not claim jobs from paused queues', async () => {
    const pool = getPool();
    const pausedQueueId = 'paused-q-' + uid;
    const workerId = 'w-pause-' + uid;

    await pool.query(`INSERT INTO queues (id, project_id, retry_policy_id, name, concurrency_limit, is_paused) VALUES ($1, $2, $3, 'Paused Queue', 100, true)`, [pausedQueueId, projectId, retryPolicyId]);
    await pool.query(`INSERT INTO workers (id, hostname, status, concurrency) VALUES ($1, 'pausehost', 'active', 5)`, [workerId]);

    const { rows: [job] } = await pool.query<{ id: string }>(`
      INSERT INTO jobs (id, queue_id, type, status, attempt_count, max_attempts, available_at, created_at, updated_at)
      VALUES (gen_random_uuid(), $1, 'test', 'QUEUED', 0, 3, NOW(), NOW(), NOW())
      RETURNING id
    `, [pausedQueueId]);

    // claimNextJob should return null for paused queue
    const claimed = await claimNextJob(pool, pausedQueueId, workerId);
    expect(claimed).toBeNull();

    // claimSpecificJob should also return null
    const specificClaim = await claimSpecificJob(pool, job.id, workerId);
    expect(specificClaim).toBeNull();

    // Job should still be QUEUED
    const { rows: [result] } = await pool.query(`SELECT status FROM jobs WHERE id = $1`, [job.id]);
    expect(result.status).toBe('QUEUED');

    // Cleanup
    await pool.query(`DELETE FROM jobs WHERE queue_id = $1`, [pausedQueueId]);
    await pool.query(`DELETE FROM queues WHERE id = $1`, [pausedQueueId]);
    await pool.query(`DELETE FROM workers WHERE id = $1`, [workerId]);
  });

  /**
   * Queue concurrency limit should be enforced.
   */
  it('should respect queue concurrency limit', async () => {
    const pool = getPool();
    const limitedQueueId = 'limited-q-' + uid;
    const workerId = 'w-limit-' + uid;
    const concurrencyLimit = 2;

    await pool.query(`INSERT INTO queues (id, project_id, retry_policy_id, name, concurrency_limit) VALUES ($1, $2, $3, 'Limited Queue', $4)`, [limitedQueueId, projectId, retryPolicyId, concurrencyLimit]);
    await pool.query(`INSERT INTO workers (id, hostname, status, concurrency) VALUES ($1, 'limithost', 'active', 10)`, [workerId]);

    // Create 5 QUEUED jobs
    for (let i = 0; i < 5; i++) {
      await pool.query(`
        INSERT INTO jobs (id, queue_id, type, status, attempt_count, max_attempts, available_at, created_at, updated_at)
        VALUES (gen_random_uuid(), $1, 'test', 'QUEUED', 0, 3, NOW(), NOW(), NOW())
      `, [limitedQueueId]);
    }

    // Claim jobs one by one and transition to RUNNING (to simulate running jobs)
    const claimedIds: string[] = [];
    for (let i = 0; i < 5; i++) {
      const claimed = await claimNextJob(pool, limitedQueueId, workerId);
      if (claimed) {
        claimedIds.push(claimed.id);
        await pool.query(`UPDATE jobs SET status = 'RUNNING', updated_at = NOW() WHERE id = $1`, [claimed.id]);
      }
    }

    // Should only have claimed 2 (concurrency limit)
    expect(claimedIds.length).toBe(concurrencyLimit);

    // Cleanup
    await pool.query(`DELETE FROM jobs WHERE queue_id = $1`, [limitedQueueId]);
    await pool.query(`DELETE FROM queues WHERE id = $1`, [limitedQueueId]);
    await pool.query(`DELETE FROM workers WHERE id = $1`, [workerId]);
  });

  /**
   * Reconciliation should be idempotent — running it multiple times
   * should not create duplicate BullMQ jobs.
   */
  it('reconciliation is idempotent', async () => {
    const pool = getPool();

    const { rows: [job] } = await pool.query<{ id: string }>(`
      INSERT INTO jobs (id, queue_id, type, status, attempt_count, max_attempts, updated_at, created_at, available_at)
      VALUES (gen_random_uuid(), $1, 'test', 'QUEUED', 0, 3, NOW() - interval '65 seconds', NOW(), NOW())
      RETURNING id
    `, [queueId]);

    // Run reconciliation 3 times
    await reconcile();
    await reconcile();
    await reconcile();

    // BullMQ should have exactly one job (idempotent job ID)
    const { Queue: BullQueue } = require('bullmq');
    const bullQueue = new BullQueue(`atlas_${queueId}`, { connection: getRedis() });
    const waitingJobs = await bullQueue.getWaiting();
    const matchingJobs = waitingJobs.filter((j: any) => j.id === job.id);
    expect(matchingJobs.length).toBe(1);
    await bullQueue.close();
  });
});
