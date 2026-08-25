import request from 'supertest';
import { Queue as BullQueue } from 'bullmq';
import { createApp } from '../../src/api/app';
import { getPool, closePool } from '../../src/shared/config/db';
import { getRedis, closeRedis } from '../../src/shared/config/redis';
import { closeBullMQManager } from '../../src/shared/lib/bullmq-manager';
import { AtlasWorker } from '../../src/worker/worker';
import { WorkerHeartbeat } from '../../src/worker/heartbeat';
import { JobRegistry } from '../../src/worker/registry';
import { registerHandlers } from '../../src/worker/handlers';
import { env } from '../../src/shared/config/env';

describe('End-to-End Processing Path', () => {
  const app = createApp();
  const uid = Date.now().toString();
  let actualOrgId: string;
  let actualProjectId: string;
  let actualQueueId: string;
  let token: string;
  let userId: string;
  let worker: AtlasWorker;
  let heartbeat: WorkerHeartbeat;

  beforeAll(async () => {
    // 1. Setup DB state
    const pool = getPool();
    
    // Create a real user and get JWT
    const email = `test-${uid}@example.com`;
    const resAuth = await request(app)
      .post('/api/v1/auth/register')
      .send({ email, password: 'password123', organization_name: 'E2E Org' });
      
    token = resAuth.body.data.token;
    userId = resAuth.body.data.user.id;
    actualOrgId = resAuth.body.data.organization.id;

    // Create Project
    const resProj = await request(app)
      .post(`/api/v1/organizations/${actualOrgId}/projects`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'E2E Project' });
    actualProjectId = resProj.body.data.project.id;

    // Create Queue
    const resQueue = await request(app)
      .post(`/api/v1/organizations/${actualOrgId}/projects/${actualProjectId}/queues`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'E2E Queue', concurrency_limit: 5 });
    actualQueueId = resQueue.body.data.queue.id;

    // 2. Start Worker
    const registry = new JobRegistry();
    registerHandlers(registry);
    heartbeat = new WorkerHeartbeat(5);
    await heartbeat.start();
    worker = new AtlasWorker(5, registry, heartbeat);
    await worker.start();
  });

  afterAll(async () => {
    if (worker) await worker.close();
    if (heartbeat) await heartbeat.stop();
    await closeBullMQManager();
    await closePool();
    await closeRedis();
  });

  it('should process a send-email job from frontend submission to completion', async () => {
    // 3. Submit an immediate send-email job
    const resJob = await request(app)
      .post(`/api/v1/organizations/${actualOrgId}/projects/${actualProjectId}/queues/${actualQueueId}/jobs`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        type: 'send-email',
        payload: { to: 'test@example.com' },
        job_mode: 'immediate'
      });
      
    expect(resJob.status).toBe(201);
    const jobId = resJob.body.data.id;
    expect(resJob.body.data.status).toBe('QUEUED');
    
    // Wait for the worker to process it
    // The worker is running locally in the same process, so it will pick it up
    let jobStatus = 'QUEUED';
    let attempts = 0;
    while (jobStatus !== 'COMPLETED' && jobStatus !== 'FAILED' && attempts < 20) {
      await new Promise(resolve => setTimeout(resolve, 500));
      const resCheck = await request(app)
        .get(`/api/v1/jobs/${jobId}`)
        .set('Authorization', `Bearer ${token}`);
      jobStatus = resCheck.body.data.status;
      attempts++;
    }

    expect(jobStatus).toBe('COMPLETED');
    
    // Verify execution record
    const resExecs = await request(app)
      .get(`/api/v1/jobs/${jobId}/executions`)
      .set('Authorization', `Bearer ${token}`);
      
    expect(resExecs.status).toBe(200);
    expect(resExecs.body.data.length).toBeGreaterThan(0);
    const exec = resExecs.body.data[0];
    expect(exec.status).toBe('completed');
    expect(exec.result).toHaveProperty('delivered', true);
  }, 15000);
  
  it('should process a failing job correctly', async () => {
    // Submit a failing job using the test handler
    const resJob = await request(app)
      .post(`/api/v1/organizations/${actualOrgId}/projects/${actualProjectId}/queues/${actualQueueId}/jobs`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        type: 'test',
        payload: { shouldFail: true, error: 'E2E intentional failure' },
        job_mode: 'immediate'
      });
      
    expect(resJob.status).toBe(201);
    const jobId = resJob.body.data.id;

    // Wait for the worker to process it
    let jobStatus = 'QUEUED';
    let attempts = 0;
    while (jobStatus !== 'COMPLETED' && jobStatus !== 'FAILED' && attempts < 20) {
      await new Promise(resolve => setTimeout(resolve, 500));
      const resCheck = await request(app)
        .get(`/api/v1/jobs/${jobId}`)
        .set('Authorization', `Bearer ${token}`);
      jobStatus = resCheck.body.data.status;
      attempts++;
    }

    expect(jobStatus).toBe('FAILED');
    
    // Verify execution record
    const resExecs = await request(app)
      .get(`/api/v1/jobs/${jobId}/executions`)
      .set('Authorization', `Bearer ${token}`);
      
    expect(resExecs.status).toBe(200);
    expect(resExecs.body.data.length).toBeGreaterThan(0);
    const exec = resExecs.body.data[resExecs.body.data.length - 1];
    expect(exec.status).toBe('failed');
    expect(exec.error_message).toBe('E2E intentional failure');
  }, 15000);
});
