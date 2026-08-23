import request from 'supertest';
import { createApp } from '../../src/api/app';
import { getPool, closePool } from '../../src/shared/config/db';

const app = createApp();

describe('Jobs API', () => {
  let token: string;
  let queueId: string;
  let projectId: string;
  let jobId: string;

  const uid = Date.now().toString();

  beforeAll(async () => {
    // Register a user + org, create a project and queue for job tests
    const regRes = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: `jobtest-${uid}@example.com`,
        password: 'password123',
        organization_name: `JobTestOrg-${uid}`,
      });
    token = regRes.body.data.token;
    const orgId = regRes.body.data.organization.id;

    const projRes = await request(app)
      .post(`/api/v1/organizations/${orgId}/projects`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `JobTestProject-${uid}` });
    projectId = projRes.body.data.project.id;

    const queueRes = await request(app)
      .post(`/api/v1/organizations/${orgId}/projects/${projectId}/queues`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `job-queue-${uid}`, concurrency_limit: 10 });
    queueId = queueRes.body.data.queue.id;
  });

  afterAll(async () => {
    await closePool();
  });

  // ─── Create Job ─────────────────────────────────────────────────────────

  describe('POST /queues/:queueId/jobs', () => {
    it('should create an immediate job', async () => {
      const res = await request(app)
        .post(`/api/v1/organizations/_/projects/${projectId}/queues/${queueId}/jobs`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          type: 'noop',
          priority: 5,
          payload: { test: true },
          job_mode: 'immediate',
        });

      expect(res.status).toBe(201);
      expect(res.body.data).toHaveProperty('id');
      expect(res.body.data.status).toBe('QUEUED');
      expect(res.body.data.type).toBe('noop');
      jobId = res.body.data.id;
    });

    it('should create a delayed job with SCHEDULED status', async () => {
      const res = await request(app)
        .post(`/api/v1/organizations/_/projects/${projectId}/queues/${queueId}/jobs`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          type: 'webhook',
          priority: 3,
          payload: { url: 'https://example.com' },
          job_mode: 'delayed',
          delay_ms: 60000,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('SCHEDULED');
    });

    it('should return 409 for duplicate idempotency key', async () => {
      const idempKey = `unique-key-${uid}`;

      // First call creates the job
      const first = await request(app)
        .post(`/api/v1/organizations/_/projects/${projectId}/queues/${queueId}/jobs`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          type: 'noop',
          payload: {},
          job_mode: 'immediate',
          idempotency_key: idempKey,
        });
      expect(first.status).toBe(201);

      // Second call with same key returns 409 with existing job
      const second = await request(app)
        .post(`/api/v1/organizations/_/projects/${projectId}/queues/${queueId}/jobs`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          type: 'noop',
          payload: {},
          job_mode: 'immediate',
          idempotency_key: idempKey,
        });
      expect(second.status).toBe(409);
      expect(second.body.data.id).toBe(first.body.data.id);
    });

    it('should reject invalid job_mode/field combos', async () => {
      const res = await request(app)
        .post(`/api/v1/organizations/_/projects/${projectId}/queues/${queueId}/jobs`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          type: 'noop',
          job_mode: 'delayed',
          // missing delay_ms
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('VALIDATION_ERROR');
    });
  });

  // ─── Batch Jobs ─────────────────────────────────────────────────────────

  describe('POST /queues/:queueId/jobs/batch', () => {
    it('should create multiple jobs atomically', async () => {
      const res = await request(app)
        .post(`/api/v1/organizations/_/projects/${projectId}/queues/${queueId}/jobs/batch`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          jobs: [
            { type: 'noop', priority: 1, payload: { idx: 1 } },
            { type: 'noop', priority: 2, payload: { idx: 2 } },
            { type: 'noop', priority: 3, payload: { idx: 3 } },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.data.created).toBe(3);
      expect(res.body.data.jobs).toHaveLength(3);
    });

    it('should reject empty batch', async () => {
      const res = await request(app)
        .post(`/api/v1/organizations/_/projects/${projectId}/queues/${queueId}/jobs/batch`)
        .set('Authorization', `Bearer ${token}`)
        .send({ jobs: [] });

      expect(res.status).toBe(400);
    });
  });

  // ─── List Jobs ──────────────────────────────────────────────────────────

  describe('GET /queues/:queueId/jobs', () => {
    it('should list jobs with pagination', async () => {
      const res = await request(app)
        .get(`/api/v1/organizations/_/projects/${projectId}/queues/${queueId}/jobs?limit=2&offset=0`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.meta).toHaveProperty('total');
      expect(res.body.meta.limit).toBe(2);
    });

    it('should filter jobs by status', async () => {
      const res = await request(app)
        .get(`/api/v1/organizations/_/projects/${projectId}/queues/${queueId}/jobs?status=QUEUED`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      for (const job of res.body.data) {
        expect(job.status).toBe('QUEUED');
      }
    });
  });

  // ─── Get Job Detail ─────────────────────────────────────────────────────

  describe('GET /jobs/:jobId', () => {
    it('should return full job details', async () => {
      const res = await request(app)
        .get(`/api/v1/jobs/${jobId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(jobId);
      expect(res.body.data).toHaveProperty('payload');
      expect(res.body.data).toHaveProperty('queue_id');
    });

    it('should return 404 for non-existent job', async () => {
      const res = await request(app)
        .get('/api/v1/jobs/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });
  });

  // ─── Executions & Logs ──────────────────────────────────────────────────

  describe('GET /jobs/:jobId/executions', () => {
    it('should return empty executions for a fresh job', async () => {
      const res = await request(app)
        .get(`/api/v1/jobs/${jobId}/executions`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.meta.total).toBe(0);
    });
  });

  describe('GET /jobs/:jobId/logs', () => {
    it('should return empty logs for a fresh job', async () => {
      const res = await request(app)
        .get(`/api/v1/jobs/${jobId}/logs`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  // ─── Cancel Job ─────────────────────────────────────────────────────────

  describe('POST /jobs/:jobId/cancel', () => {
    it('should cancel a QUEUED job', async () => {
      // Create a fresh job to cancel
      const createRes = await request(app)
        .post(`/api/v1/organizations/_/projects/${projectId}/queues/${queueId}/jobs`)
        .set('Authorization', `Bearer ${token}`)
        .send({ type: 'noop', payload: {}, job_mode: 'immediate' });

      const cancelId = createRes.body.data.id;

      const res = await request(app)
        .post(`/api/v1/jobs/${cancelId}/cancel`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('CANCELLED');
    });

    it('should reject cancelling a CANCELLED job', async () => {
      // Create and cancel a job, then try to cancel again
      const createRes = await request(app)
        .post(`/api/v1/organizations/_/projects/${projectId}/queues/${queueId}/jobs`)
        .set('Authorization', `Bearer ${token}`)
        .send({ type: 'noop', payload: {}, job_mode: 'immediate' });

      const id = createRes.body.data.id;
      await request(app)
        .post(`/api/v1/jobs/${id}/cancel`)
        .set('Authorization', `Bearer ${token}`);

      const res = await request(app)
        .post(`/api/v1/jobs/${id}/cancel`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(422);
      expect(res.body.error).toBe('INVALID_STATE_TRANSITION');
    });
  });

  // ─── Retry Job ──────────────────────────────────────────────────────────

  describe('POST /jobs/:jobId/retry', () => {
    it('should reject retrying a QUEUED job (only FAILED allowed)', async () => {
      const res = await request(app)
        .post(`/api/v1/jobs/${jobId}/retry`)
        .set('Authorization', `Bearer ${token}`);

      // jobId is QUEUED, not FAILED, so transition should be invalid
      expect(res.status).toBe(422);
      expect(res.body.error).toBe('INVALID_STATE_TRANSITION');
    });
  });
});
