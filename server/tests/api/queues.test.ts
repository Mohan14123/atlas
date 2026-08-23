import request from 'supertest';
import { createApp } from '../../src/api/app';
import { getPool, closePool } from '../../src/shared/config/db';

const app = createApp();

describe('Queues API', () => {
  let authToken = '';
  let organizationId = '';
  let projectId = '';
  let queueId = '';
  const uniqueSuffix = Date.now().toString();

  beforeAll(async () => {
    // 1. Register User & Org
    let res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: `queuetest-${uniqueSuffix}@example.com`,
        password: 'password123',
        organization_name: 'Queue Test Org',
      });
    
    authToken = res.body.data.token;
    organizationId = res.body.data.organization.id;

    // 2. Create Project
    res = await request(app)
      .post(`/api/v1/organizations/${organizationId}/projects`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'Queue Test Project' });
    
    projectId = res.body.data.project.id;
  });

  afterAll(async () => {
    await closePool();
  });

  describe('POST /api/v1/organizations/:orgId/projects/:projectId/queues', () => {
    it('should create a new queue', async () => {
      const res = await request(app)
        .post(`/api/v1/organizations/${organizationId}/projects/${projectId}/queues`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'email-queue', concurrency_limit: 5, is_paused: false });

      expect(res.status).toBe(201);
      expect(res.body.data.queue).toHaveProperty('id');
      expect(res.body.data.queue.name).toBe('email-queue');
      expect(res.body.data.queue.concurrency_limit).toBe(5);
      
      queueId = res.body.data.queue.id;
    });
  });

  describe('GET /api/v1/organizations/:orgId/projects/:projectId/queues', () => {
    it('should list queues in the project', async () => {
      const res = await request(app)
        .get(`/api/v1/organizations/${organizationId}/projects/${projectId}/queues`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data.queues)).toBe(true);
      expect(res.body.data.queues.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data.queues[0].id).toBe(queueId);
    });
  });

  describe('GET /api/v1/organizations/:orgId/projects/:projectId/queues/:queueId', () => {
    it('should get a specific queue', async () => {
      const res = await request(app)
        .get(`/api/v1/organizations/${organizationId}/projects/${projectId}/queues/${queueId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.queue.id).toBe(queueId);
      expect(res.body.data.queue.name).toBe('email-queue');
    });
  });

  describe('PUT /api/v1/organizations/:orgId/projects/:projectId/queues/:queueId', () => {
    it('should update queue concurrency and pause status', async () => {
      const res = await request(app)
        .put(`/api/v1/organizations/${organizationId}/projects/${projectId}/queues/${queueId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ concurrency_limit: 10, is_paused: true });

      expect(res.status).toBe(200);
      expect(res.body.data.queue.concurrency_limit).toBe(10);
      expect(res.body.data.queue.is_paused).toBe(true);
    });
  });

  describe('DELETE /api/v1/organizations/:orgId/projects/:projectId/queues/:queueId', () => {
    it('should delete the queue', async () => {
      const res = await request(app)
        .delete(`/api/v1/organizations/${organizationId}/projects/${projectId}/queues/${queueId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.message).toBe('Queue deleted successfully');

      // Verify deletion
      const getRes = await request(app)
        .get(`/api/v1/organizations/${organizationId}/projects/${projectId}/queues/${queueId}`)
        .set('Authorization', `Bearer ${authToken}`);
      
      expect(getRes.status).toBe(404);
    });
  });
});
