import { getPool, closePool } from '../../src/shared/config/db';
import { getRedis, closeRedis } from '../../src/shared/config/redis';
import { Queue as BullQueue } from 'bullmq';
import { detectStaleWorkers } from '../../src/scheduler/jobs/detectStaleWorkers';
import { recoverOrphanedJobs } from '../../src/scheduler/jobs/recoverOrphanedJobs';
import { promoteDelayedJobs } from '../../src/scheduler/jobs/promoteDelayedJobs';
import { retryFailedJobs } from '../../src/scheduler/jobs/retryFailedJobs';
import { createDueJobs } from '../../src/scheduler/jobs/createDueJobs';
import { reconcile } from '../../src/scheduler/jobs/reconcile';

describe('Scheduler Integration Tests', () => {
  const uid = Date.now().toString();
  const queueId = 'queue-' + uid;
  const retryPolicyId = 'retry-' + uid;
  const projectId = 'proj-' + uid;
  const orgId = 'org-' + uid;

  beforeAll(async () => {
    const pool = getPool();
    // Setup necessary foreign keys
    await pool.query(`INSERT INTO organizations (id, name) VALUES ($1, 'Test Org')`, [orgId]);
    await pool.query(`INSERT INTO projects (id, organization_id, name) VALUES ($1, $2, 'Test Proj')`, [projectId, orgId]);
    await pool.query(`INSERT INTO retry_policies (id, strategy, max_attempts) VALUES ($1, 'fixed', 3)`, [retryPolicyId]);
    await pool.query(`INSERT INTO queues (id, project_id, retry_policy_id, name) VALUES ($1, $2, $3, 'Test Queue')`, [queueId, projectId, retryPolicyId]);
  });

  afterAll(async () => {
    const pool = getPool();
    await pool.query(`DELETE FROM organizations WHERE id = $1`, [orgId]);
    await closePool();
    await closeRedis();
  });

  afterEach(async () => {
    const pool = getPool();
    await pool.query(`DELETE FROM workers WHERE hostname LIKE $1`, [`%-test-${uid}`]);
    await pool.query(`DELETE FROM jobs WHERE queue_id = $1`, [queueId]);
    await pool.query(`DELETE FROM job_schedules WHERE queue_id = $1`, [queueId]);
  });

  it('detectStaleWorkers should mark stale workers unhealthy', async () => {
    const pool = getPool();
    const workerId = `w1-${uid}`;
    await pool.query(`INSERT INTO workers (id, hostname, status) VALUES ($1, $2, 'active')`, [workerId, `stale-test-${uid}`]);
    // Heartbeat older than 30s
    await pool.query(`INSERT INTO worker_heartbeats (id, worker_id, heartbeat_at) VALUES (gen_random_uuid(), $1, NOW() - interval '40 seconds')`, [workerId]);

    await detectStaleWorkers();

    const { rows } = await pool.query(`SELECT status FROM workers WHERE id = $1`, [workerId]);
    expect(rows[0].status).toBe('unhealthy');
  });

  it('recoverOrphanedJobs should transition jobs from unhealthy workers back to QUEUED', async () => {
    const pool = getPool();
    const workerId = `w2-${uid}`;
    await pool.query(`INSERT INTO workers (id, hostname, status) VALUES ($1, $2, 'unhealthy')`, [workerId, `unh-test-${uid}`]);
    const { rows: jobRows } = await pool.query(`
      INSERT INTO jobs (id, queue_id, type, status, worker_id, attempt_count, max_attempts, updated_at) 
      VALUES (gen_random_uuid(), $1, 'test', 'CLAIMED', $2, 0, 3, NOW()) 
      RETURNING id
    `, [queueId, workerId]);
    const jobId = jobRows[0].id;

    await recoverOrphanedJobs();

    const { rows } = await pool.query(`SELECT status, worker_id FROM jobs WHERE id = $1`, [jobId]);
    expect(rows[0].status).toBe('QUEUED');
    expect(rows[0].worker_id).toBeNull();
  });

  it('promoteDelayedJobs should promote SCHEDULED jobs when due', async () => {
    const pool = getPool();
    const { rows: jobRows } = await pool.query(`
      INSERT INTO jobs (id, queue_id, type, status, attempt_count, max_attempts, available_at, updated_at) 
      VALUES (gen_random_uuid(), $1, 'test', 'SCHEDULED', 0, 3, NOW() - interval '1 second', NOW()) 
      RETURNING id
    `, [queueId]);
    const jobId = jobRows[0].id;

    await promoteDelayedJobs();

    const { rows } = await pool.query(`SELECT status FROM jobs WHERE id = $1`, [jobId]);
    expect(rows[0].status).toBe('QUEUED');
  });

  it('retryFailedJobs should queue or schedule failed jobs with attempts left', async () => {
    const pool = getPool();
    const { rows: jobRows } = await pool.query(`
      INSERT INTO jobs (id, queue_id, type, status, attempt_count, max_attempts, updated_at) 
      VALUES (gen_random_uuid(), $1, 'test', 'FAILED', 1, 3, NOW()) 
      RETURNING id
    `, [queueId]);
    const jobId = jobRows[0].id;

    await retryFailedJobs();

    const { rows } = await pool.query(`SELECT status FROM jobs WHERE id = $1`, [jobId]);
    // The retry policy is fixed (default 1000ms delay), so it should become SCHEDULED
    expect(rows[0].status).toBe('SCHEDULED');
  });

  it('createDueJobs should create exactly one job instance for a due schedule', async () => {
    const pool = getPool();
    const { rows: scheduleRows } = await pool.query(`
      INSERT INTO job_schedules (id, queue_id, schedule_type, cron_expression, timezone, job_type, next_run_at) 
      VALUES (gen_random_uuid(), $1, 'cron', '* * * * *', 'UTC', 'test', NOW() - interval '10 seconds') 
      RETURNING id
    `, [queueId]);
    const scheduleId = scheduleRows[0].id;

    await createDueJobs();

    const { rows: jobs } = await pool.query(`SELECT id, status FROM jobs WHERE schedule_id = $1`, [scheduleId]);
    expect(jobs.length).toBe(1);
    expect(jobs[0].status).toBe('QUEUED');
  });

  it('reconcile should re-enqueue missing BullMQ jobs', async () => {
    const pool = getPool();
    const { rows: jobRows } = await pool.query(`
      INSERT INTO jobs (id, queue_id, type, status, attempt_count, max_attempts, updated_at) 
      VALUES (gen_random_uuid(), $1, 'test', 'QUEUED', 0, 3, NOW() - interval '65 seconds') 
      RETURNING id
    `, [queueId]);
    const jobId = jobRows[0].id;

    await reconcile();

    const bullQueue = new BullQueue(`atlas_${queueId}`, { connection: getRedis() });
    const bullJob = await bullQueue.getJob(jobId);
    expect(bullJob).toBeDefined();
    expect(bullJob?.id).toBe(jobId);
    await bullQueue.close();
  });
});
