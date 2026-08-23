import { Pool } from 'pg';
import { Queue as BullQueue } from 'bullmq';
import { getPool } from '../../src/shared/config/db';
import { getRedis } from '../../src/shared/config/redis';
import { JobRegistry } from '../../src/worker/registry';
import { WorkerHeartbeat } from '../../src/worker/heartbeat';
import { AtlasWorker } from '../../src/worker/worker';

describe('Atlas Worker Service', () => {
  let pool: Pool;
  let bullQueue: BullQueue;
  let worker: AtlasWorker;
  let heartbeat: WorkerHeartbeat;
  let registry: JobRegistry;

  beforeAll(async () => {
    pool = getPool();
  });
  afterAll(async () => {
    await pool.end();
  });

  it('should process a job end-to-end', async () => {
    // 1. Setup handler
    registry = new JobRegistry();
    let handlerCalled = false;
    registry.register('test-job', async (payload) => {
      handlerCalled = true;
      expect(payload.foo).toBe('bar');
      return { success: true };
    });

    // 2. Create a queue and a job in Postgres
    const { rows: orgRows } = await pool.query(`
      INSERT INTO organizations (id, name) VALUES (gen_random_uuid(), 'Test Org') RETURNING id
    `);
    const { rows: projRows } = await pool.query(`
      INSERT INTO projects (id, organization_id, name) VALUES (gen_random_uuid(), $1, 'Test Proj') RETURNING id
    `, [orgRows[0].id]);
    
    const { rows: retryPolicyRows } = await pool.query(`
      INSERT INTO retry_policies (id, strategy, max_attempts)
      VALUES (gen_random_uuid(), 'fixed', 3)
      RETURNING id
    `);

    const { rows: queueRows } = await pool.query(`
      INSERT INTO queues (id, project_id, retry_policy_id, name, concurrency_limit, is_paused)
      VALUES (gen_random_uuid(), $1, $2, 'test-queue', 1, false)
      RETURNING id
    `, [projRows[0].id, retryPolicyRows[0].id]);
    const queueId = queueRows[0].id;

    const { rows: jobRows } = await pool.query(`
      INSERT INTO jobs (id, queue_id, type, status, payload, max_attempts, updated_at)
      VALUES (gen_random_uuid(), $1, 'test-job', 'QUEUED', '{"foo":"bar"}'::jsonb, 3, NOW())
      RETURNING id
    `, [queueId]);
    const jobId = jobRows[0].id;

    // 3. Setup Worker
    heartbeat = new WorkerHeartbeat(1);
    await heartbeat.start();
    worker = new AtlasWorker(1, registry, heartbeat);
    await worker.start();

    // 4. Enqueue to BullMQ
    bullQueue = new BullQueue(`atlas_${queueId}`, { connection: getRedis() });
    await bullQueue.drain();
    await bullQueue.add('test-job', { jobId }, { jobId });

    // 5. Wait for execution
    await new Promise(resolve => setTimeout(resolve, 500));

    // 6. Assertions
    expect(handlerCalled).toBe(true);

    const { rows: checkJob } = await pool.query(`SELECT status FROM jobs WHERE id = $1`, [jobId]);
    expect(checkJob[0].status).toBe('COMPLETED');

    await bullQueue.close();
    await worker.close();
    await heartbeat.stop();
  });
});
