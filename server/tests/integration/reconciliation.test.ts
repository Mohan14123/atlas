import { Queue as BullQueue } from 'bullmq';
import { getPool, closePool } from '../../src/shared/config/db';
import { getRedis, closeRedis } from '../../src/shared/config/redis';
import { reconcile } from '../../src/scheduler/jobs/reconcile';
import { claimSpecificJob, transitionJobStatus } from '../../src/shared/db/queries/jobs';
import { closeBullMQManager, getBullMQManager } from '../../src/shared/lib/bullmq-manager';

/**
 * Integration test: PG→BullMQ boundary recovery.
 *
 * Simulates the scenario where:
 *   1. PostgreSQL job creation succeeds (job is QUEUED in PG).
 *   2. BullMQ enqueue is intentionally skipped (simulating scheduler crash).
 *   3. Reconciliation runs.
 *   4. Exactly one BullMQ job is recovered.
 *   5. Worker executes it exactly once at the PostgreSQL state-machine level.
 */
describe('Reconciliation — PG→BullMQ boundary recovery', () => {
  const uid = Date.now().toString();
  const queueId = 'recon-q-' + uid;
  const retryPolicyId = 'recon-rp-' + uid;
  const projectId = 'recon-proj-' + uid;
  const orgId = 'recon-org-' + uid;

  beforeAll(async () => {
    const pool = getPool();
    await pool.query(`INSERT INTO organizations (id, name) VALUES ($1, 'Recon Org')`, [orgId]);
    await pool.query(`INSERT INTO projects (id, organization_id, name) VALUES ($1, $2, 'Recon Proj')`, [projectId, orgId]);
    await pool.query(`INSERT INTO retry_policies (id, strategy, max_attempts) VALUES ($1, 'fixed', 3)`, [retryPolicyId]);
    await pool.query(`INSERT INTO queues (id, project_id, retry_policy_id, name, concurrency_limit) VALUES ($1, $2, $3, 'Recon Queue', 100)`, [queueId, projectId, retryPolicyId]);
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
    // Clean BullMQ queue
    const bullQueue = new BullQueue(`atlas_${queueId}`, { connection: getRedis() });
    await bullQueue.drain();
    await bullQueue.close();
  });

  it('should recover a QUEUED job that has no BullMQ counterpart', async () => {
    const pool = getPool();

    // Step 1: Create a job in PG as QUEUED (simulating PG commit succeeded)
    // Set updated_at to >60s ago to trigger reconciliation
    const { rows: [job] } = await pool.query<{ id: string }>(`
      INSERT INTO jobs (id, queue_id, type, status, attempt_count, max_attempts, updated_at, created_at, available_at)
      VALUES (gen_random_uuid(), $1, 'test', 'QUEUED', 0, 3, NOW() - interval '65 seconds', NOW(), NOW())
      RETURNING id
    `, [queueId]);

    // Step 2: BullMQ enqueue is INTENTIONALLY SKIPPED (simulating crash)
    // Verify no BullMQ job exists
    const bullQueue = new BullQueue(`atlas_${queueId}`, { connection: getRedis() });
    const existingJob = await bullQueue.getJob(job.id);
    expect(existingJob).toBeUndefined();

    // Step 3: Run reconciliation
    await reconcile();

    // Step 4: Verify exactly one BullMQ job was recovered
    const recoveredJob = await bullQueue.getJob(job.id);
    expect(recoveredJob).toBeDefined();
    expect(recoveredJob?.id).toBe(job.id);
    expect(recoveredJob?.data.jobId).toBe(job.id);

    // Step 5: Verify the PG state is still QUEUED (reconciliation doesn't change PG state)
    const { rows: [pgJob] } = await pool.query(`SELECT status FROM jobs WHERE id = $1`, [job.id]);
    expect(pgJob.status).toBe('QUEUED');

    await bullQueue.close();
  });

  it('should not re-enqueue a job that already exists in BullMQ', async () => {
    const pool = getPool();

    // Create a stale QUEUED job
    const { rows: [job] } = await pool.query<{ id: string }>(`
      INSERT INTO jobs (id, queue_id, type, status, attempt_count, max_attempts, updated_at, created_at, available_at)
      VALUES (gen_random_uuid(), $1, 'test', 'QUEUED', 0, 3, NOW() - interval '65 seconds', NOW(), NOW())
      RETURNING id
    `, [queueId]);

    // Manually enqueue to BullMQ first
    const bullQueue = new BullQueue(`atlas_${queueId}`, { connection: getRedis() });
    await bullQueue.add('test', { jobId: job.id }, { jobId: job.id });

    // Run reconciliation
    await reconcile();

    // Should still be exactly one job (not duplicated)
    const waitingJobs = await bullQueue.getWaiting();
    const matchingJobs = waitingJobs.filter(j => j.id === job.id);
    expect(matchingJobs.length).toBe(1);

    await bullQueue.close();
  });

  it('should not re-enqueue a job that has been CANCELLED', async () => {
    const pool = getPool();

    // Create a QUEUED job that looks stale
    const { rows: [job] } = await pool.query<{ id: string }>(`
      INSERT INTO jobs (id, queue_id, type, status, attempt_count, max_attempts, updated_at, created_at, available_at)
      VALUES (gen_random_uuid(), $1, 'test', 'QUEUED', 0, 3, NOW() - interval '65 seconds', NOW(), NOW())
      RETURNING id
    `, [queueId]);

    // Now cancel the job (simulating concurrent cancellation)
    await pool.query(`UPDATE jobs SET status = 'CANCELLED', updated_at = NOW() WHERE id = $1`, [job.id]);

    // Run reconciliation
    await reconcile();

    // Verify no BullMQ job was created (job was cancelled between query and re-enqueue check)
    const bullQueue = new BullQueue(`atlas_${queueId}`, { connection: getRedis() });
    const bullJob = await bullQueue.getJob(job.id);
    expect(bullJob).toBeUndefined();

    await bullQueue.close();
  });

  it('should recover a job and allow worker to claim and complete it exactly once', async () => {
    const pool = getPool();
    const workerId = `w-recon-${uid}`;
    await pool.query(`INSERT INTO workers (id, hostname, status, concurrency) VALUES ($1, 'reconhost', 'active', 5)`, [workerId]);

    // Create QUEUED job with no BullMQ counterpart
    const { rows: [job] } = await pool.query<{ id: string }>(`
      INSERT INTO jobs (id, queue_id, type, status, attempt_count, max_attempts, updated_at, created_at, available_at)
      VALUES (gen_random_uuid(), $1, 'test', 'QUEUED', 0, 3, NOW() - interval '65 seconds', NOW(), NOW())
      RETURNING id
    `, [queueId]);

    // Reconcile
    await reconcile();

    // Claim the job (simulating worker picking it up)
    const claimed = await claimSpecificJob(pool, job.id, workerId);
    expect(claimed).not.toBeNull();
    expect(claimed!.status).toBe('CLAIMED');

    // Transition through state machine
    await transitionJobStatus(pool, job.id, 'CLAIMED', 'RUNNING', { started_at: new Date() });
    await transitionJobStatus(pool, job.id, 'RUNNING', 'COMPLETED', { completed_at: new Date() });

    // Verify final state
    const { rows: [finalJob] } = await pool.query(`SELECT status FROM jobs WHERE id = $1`, [job.id]);
    expect(finalJob.status).toBe('COMPLETED');

    // Attempt to claim again (simulating duplicate BullMQ delivery) — should fail
    const secondClaim = await claimSpecificJob(pool, job.id, workerId);
    expect(secondClaim).toBeNull();

    // Cleanup worker
    await pool.query(`DELETE FROM workers WHERE id = $1`, [workerId]);
  });
});
