import { getPool, closePool } from '../../src/shared/config/db';
import { getRedis, closeRedis } from '../../src/shared/config/redis';
import { claimSpecificJob, transitionJobStatus } from '../../src/shared/db/queries/jobs';
import { detectStaleWorkers } from '../../src/scheduler/jobs/detectStaleWorkers';
import { recoverOrphanedJobs } from '../../src/scheduler/jobs/recoverOrphanedJobs';
import { closeBullMQManager } from '../../src/shared/lib/bullmq-manager';

/**
 * Integration tests for worker crash recovery scenarios.
 *
 * These tests verify that PostgreSQL remains authoritative after worker crashes,
 * that duplicate BullMQ delivery does not produce duplicate execution, and that
 * the stale-worker recovery pipeline correctly re-queues orphaned jobs.
 *
 * Execution guarantee: at-least-once handler invocation, exactly-once PG state transition.
 */
describe('Worker Crash Recovery', () => {
  const uid = Date.now().toString();
  const queueId = 'crash-q-' + uid;
  const retryPolicyId = 'crash-rp-' + uid;
  const projectId = 'crash-proj-' + uid;
  const orgId = 'crash-org-' + uid;
  const healthyWorkerId = 'w-healthy-' + uid;
  const crashedWorkerId = 'w-crashed-' + uid;

  beforeAll(async () => {
    const pool = getPool();
    await pool.query(`INSERT INTO organizations (id, name) VALUES ($1, 'Crash Org')`, [orgId]);
    await pool.query(`INSERT INTO projects (id, organization_id, name) VALUES ($1, $2, 'Crash Proj')`, [projectId, orgId]);
    await pool.query(`INSERT INTO retry_policies (id, strategy, max_attempts) VALUES ($1, 'fixed', 3)`, [retryPolicyId]);
    await pool.query(`INSERT INTO queues (id, project_id, retry_policy_id, name, concurrency_limit) VALUES ($1, $2, $3, 'Crash Queue', 100)`, [queueId, projectId, retryPolicyId]);

    // Register workers
    await pool.query(`INSERT INTO workers (id, hostname, status, concurrency) VALUES ($1, 'healthyhost', 'active', 5)`, [healthyWorkerId]);
    // Crashed worker: stale heartbeat so detectStaleWorkers marks it unhealthy
    await pool.query(`INSERT INTO workers (id, hostname, status, concurrency) VALUES ($1, 'crashedhost', 'active', 5)`, [crashedWorkerId]);
    await pool.query(`INSERT INTO worker_heartbeats (id, worker_id, heartbeat_at) VALUES (gen_random_uuid(), $1, NOW() - interval '60 seconds')`, [crashedWorkerId]);
  });

  afterAll(async () => {
    const pool = getPool();
    await pool.query(`DELETE FROM organizations WHERE id = $1`, [orgId]);
    await pool.query(`DELETE FROM workers WHERE id IN ($1, $2)`, [healthyWorkerId, crashedWorkerId]);
    await closeBullMQManager();
    await closePool();
    await closeRedis();
  });

  afterEach(async () => {
    const pool = getPool();
    await pool.query(`DELETE FROM jobs WHERE queue_id = $1`, [queueId]);
    // Reset crashed worker for next test
    await pool.query(`UPDATE workers SET status = 'active' WHERE id = $1`, [crashedWorkerId]);
    await pool.query(`DELETE FROM worker_heartbeats WHERE worker_id = $1`, [crashedWorkerId]);
    await pool.query(`INSERT INTO worker_heartbeats (id, worker_id, heartbeat_at) VALUES (gen_random_uuid(), $1, NOW() - interval '60 seconds')`, [crashedWorkerId]);
  });

  /**
   * Scenario A: Worker claims job → worker crashes before RUNNING.
   * Expected: Job stays CLAIMED with worker_id set. Stale worker detection
   * marks the worker unhealthy. recoverOrphanedJobs transitions CLAIMED→QUEUED.
   */
  it('Scenario A: crash after CLAIMED, before RUNNING → recovery via stale detection', async () => {
    const pool = getPool();

    // Create a QUEUED job
    const { rows: [job] } = await pool.query<{ id: string }>(`
      INSERT INTO jobs (id, queue_id, type, status, attempt_count, max_attempts, available_at, created_at, updated_at)
      VALUES (gen_random_uuid(), $1, 'test', 'QUEUED', 0, 3, NOW(), NOW(), NOW())
      RETURNING id
    `, [queueId]);

    // Worker claims it
    const claimed = await claimSpecificJob(pool, job.id, crashedWorkerId);
    expect(claimed).not.toBeNull();
    expect(claimed!.status).toBe('CLAIMED');

    // Worker crashes (heartbeat is already stale from beforeAll setup)

    // Scheduler detects stale worker
    await detectStaleWorkers();
    const { rows: [worker] } = await pool.query(`SELECT status FROM workers WHERE id = $1`, [crashedWorkerId]);
    expect(worker.status).toBe('unhealthy');

    // Scheduler recovers orphaned jobs
    await recoverOrphanedJobs();

    // Verify job is back to QUEUED
    const { rows: [recovered] } = await pool.query(`SELECT status, worker_id FROM jobs WHERE id = $1`, [job.id]);
    expect(recovered.status).toBe('QUEUED');
    expect(recovered.worker_id).toBeNull();

    // Healthy worker can now claim it
    const reClaimed = await claimSpecificJob(pool, job.id, healthyWorkerId);
    expect(reClaimed).not.toBeNull();
  });

  /**
   * Scenario B: Worker transitions to RUNNING → worker crashes during handler.
   * Expected: Job stays RUNNING. Stale detection → orphan recovery → QUEUED.
   * Handler invocation is at-least-once (may re-execute).
   */
  it('Scenario B: crash during RUNNING → recovery re-queues for re-execution', async () => {
    const pool = getPool();

    // Create and claim a job
    const { rows: [job] } = await pool.query<{ id: string }>(`
      INSERT INTO jobs (id, queue_id, type, status, attempt_count, max_attempts, available_at, created_at, updated_at)
      VALUES (gen_random_uuid(), $1, 'test', 'QUEUED', 0, 3, NOW(), NOW(), NOW())
      RETURNING id
    `, [queueId]);

    await claimSpecificJob(pool, job.id, crashedWorkerId);
    await transitionJobStatus(pool, job.id, 'CLAIMED', 'RUNNING', { started_at: new Date() });

    // Worker crashes during handler execution
    // (heartbeat is stale)

    await detectStaleWorkers();
    await recoverOrphanedJobs();

    // Verify re-queued
    const { rows: [recovered] } = await pool.query(`SELECT status, worker_id FROM jobs WHERE id = $1`, [job.id]);
    expect(recovered.status).toBe('QUEUED');
    expect(recovered.worker_id).toBeNull();
  });

  /**
   * Scenario C: Handler succeeds → worker crashes before COMPLETED transition.
   * Expected: Job stays RUNNING. Recovery re-queues it. Handler will be
   * re-invoked (at-least-once). This is the documented tradeoff.
   */
  it('Scenario C: handler succeeds, crash before COMPLETED → re-queued (at-least-once)', async () => {
    const pool = getPool();

    const { rows: [job] } = await pool.query<{ id: string }>(`
      INSERT INTO jobs (id, queue_id, type, status, attempt_count, max_attempts, available_at, created_at, updated_at)
      VALUES (gen_random_uuid(), $1, 'test', 'QUEUED', 0, 3, NOW(), NOW(), NOW())
      RETURNING id
    `, [queueId]);

    await claimSpecificJob(pool, job.id, crashedWorkerId);
    await transitionJobStatus(pool, job.id, 'CLAIMED', 'RUNNING', { started_at: new Date() });

    // Handler succeeds but worker crashes before transitionJobStatus(RUNNING→COMPLETED)
    // Job remains RUNNING in PG

    await detectStaleWorkers();
    await recoverOrphanedJobs();

    // Job goes back to QUEUED — handler will be re-invoked (at-least-once semantics)
    const { rows: [recovered] } = await pool.query(`SELECT status FROM jobs WHERE id = $1`, [job.id]);
    expect(recovered.status).toBe('QUEUED');

    // Second worker can claim and complete
    const reClaimed = await claimSpecificJob(pool, job.id, healthyWorkerId);
    expect(reClaimed).not.toBeNull();
    await transitionJobStatus(pool, job.id, 'CLAIMED', 'RUNNING', { started_at: new Date() });
    await transitionJobStatus(pool, job.id, 'RUNNING', 'COMPLETED', { completed_at: new Date() });

    const { rows: [final] } = await pool.query(`SELECT status FROM jobs WHERE id = $1`, [job.id]);
    expect(final.status).toBe('COMPLETED');
  });

  /**
   * Scenario D: Worker completes job (COMPLETED in PG) → BullMQ ack is irrelevant.
   * Expected: Duplicate BullMQ delivery after completion produces no state change.
   */
  it('Scenario D: COMPLETED → duplicate claim attempt returns null', async () => {
    const pool = getPool();

    const { rows: [job] } = await pool.query<{ id: string }>(`
      INSERT INTO jobs (id, queue_id, type, status, attempt_count, max_attempts, available_at, created_at, updated_at)
      VALUES (gen_random_uuid(), $1, 'test', 'QUEUED', 0, 3, NOW(), NOW(), NOW())
      RETURNING id
    `, [queueId]);

    // First worker claims and completes
    await claimSpecificJob(pool, job.id, healthyWorkerId);
    await transitionJobStatus(pool, job.id, 'CLAIMED', 'RUNNING', { started_at: new Date() });
    await transitionJobStatus(pool, job.id, 'RUNNING', 'COMPLETED', { completed_at: new Date() });

    // Duplicate BullMQ delivery — another worker tries to claim the same job
    const duplicateClaim = await claimSpecificJob(pool, job.id, crashedWorkerId);
    expect(duplicateClaim).toBeNull();

    // PG state is still COMPLETED
    const { rows: [final] } = await pool.query(`SELECT status FROM jobs WHERE id = $1`, [job.id]);
    expect(final.status).toBe('COMPLETED');
  });

  /**
   * Verify that transitionJobStatus rejects concurrent state changes.
   * If two workers somehow both try to transition RUNNING→COMPLETED on the
   * same job, only one should succeed.
   */
  it('should reject concurrent RUNNING→COMPLETED transitions', async () => {
    const pool = getPool();

    const { rows: [job] } = await pool.query<{ id: string }>(`
      INSERT INTO jobs (id, queue_id, type, status, attempt_count, max_attempts, available_at, created_at, updated_at)
      VALUES (gen_random_uuid(), $1, 'test', 'QUEUED', 0, 3, NOW(), NOW(), NOW())
      RETURNING id
    `, [queueId]);

    await claimSpecificJob(pool, job.id, healthyWorkerId);
    await transitionJobStatus(pool, job.id, 'CLAIMED', 'RUNNING', { started_at: new Date() });

    // Race: two concurrent COMPLETED transitions
    const results = await Promise.allSettled([
      transitionJobStatus(pool, job.id, 'RUNNING', 'COMPLETED', { completed_at: new Date() }),
      transitionJobStatus(pool, job.id, 'RUNNING', 'COMPLETED', { completed_at: new Date() }),
    ]);

    const successes = results.filter(r => r.status === 'fulfilled');
    const failures = results.filter(r => r.status === 'rejected');

    // Exactly one succeeds, one fails (not in expected status)
    expect(successes.length).toBe(1);
    expect(failures.length).toBe(1);
  });
});
