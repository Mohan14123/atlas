import request from 'supertest';
import { createApp } from '../../src/api/app';
import { getPool, closePool } from '../../src/shared/config/db';

const app = createApp();

describe('Schedules API', () => {
  let authToken = '';
  let organizationId = '';
  let projectId = '';
  let queueId = '';
  let scheduleId = '';
  const uniqueSuffix = Date.now().toString();

  beforeAll(async () => {
    // 1. Register User & Org
    let res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: `scheduletest-${uniqueSuffix}@example.com`,
        password: 'password123',
        organization_name: 'Schedule Test Org',
      });
    
    expect(res.status).toBe(201);
    expect(res.body.data).toHaveProperty('token');

    authToken = res.body.data.token;
    organizationId = res.body.data.organization.id;

    // 2. Create Project
    res = await request(app)
      .post(`/api/v1/organizations/${organizationId}/projects`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'Schedule Test Project' });
    
    expect(res.status).toBe(201);
    projectId = res.body.data.project.id;

    // 3. Create Queue
    res = await request(app)
      .post(`/api/v1/organizations/${organizationId}/projects/${projectId}/queues`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'Schedule Test Queue' });
    
    expect(res.status).toBe(201);
    queueId = res.body.data.queue.id;
  });

  afterAll(async () => {
    await closePool();
  });

  describe('POST .../queues/:queueId/schedules', () => {
    it('should create a cron schedule', async () => {
      const res = await request(app)
        .post(`/api/v1/organizations/${organizationId}/projects/${projectId}/queues/${queueId}/schedules`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          schedule_type: 'cron',
          cron_expression: '* * * * *',
          job_type: 'test-job',
          job_payload: { foo: 'bar' }
        });
      
      expect(res.status).toBe(201);
      expect(res.body.data.schedule).toHaveProperty('id');
      expect(res.body.data.schedule.schedule_type).toBe('cron');
      expect(res.body.data.schedule.cron_expression).toBe('* * * * *');
      expect(res.body.data.schedule.next_run_at).not.toBeNull();
      scheduleId = res.body.data.schedule.id;
    });

    it('should fail if cron expression is invalid', async () => {
      const res = await request(app)
        .post(`/api/v1/organizations/${organizationId}/projects/${projectId}/queues/${queueId}/schedules`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          schedule_type: 'cron',
          cron_expression: 'invalid_cron',
          job_type: 'test-job',
        });
      
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('INVALID_CRON_EXPRESSION');
    });
  });

  describe('GET .../queues/:queueId/schedules', () => {
    it('should list schedules for a queue', async () => {
      const res = await request(app)
        .get(`/api/v1/organizations/${organizationId}/projects/${projectId}/queues/${queueId}/schedules`)
        .set('Authorization', `Bearer ${authToken}`);
      
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data.schedules)).toBe(true);
      expect(res.body.data.schedules.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('GET .../schedules/:scheduleId', () => {
    it('should get a schedule by id', async () => {
      const res = await request(app)
        .get(`/api/v1/organizations/${organizationId}/projects/${projectId}/queues/${queueId}/schedules/${scheduleId}`)
        .set('Authorization', `Bearer ${authToken}`);
      
      expect(res.status).toBe(200);
      expect(res.body.data.schedule.id).toBe(scheduleId);
    });
  });

  describe('PATCH .../schedules/:scheduleId', () => {
    it('should update a schedule', async () => {
      const res = await request(app)
        .put(`/api/v1/organizations/${organizationId}/projects/${projectId}/queues/${queueId}/schedules/${scheduleId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          job_type: 'updated-job'
        });
      
      expect(res.status).toBe(200);
      expect(res.body.data.schedule.job_type).toBe('updated-job');
    });
  });

  describe('DELETE .../schedules/:scheduleId', () => {
    it('should delete a schedule', async () => {
      const res = await request(app)
        .delete(`/api/v1/organizations/${organizationId}/projects/${projectId}/queues/${queueId}/schedules/${scheduleId}`)
        .set('Authorization', `Bearer ${authToken}`);
      
      expect(res.status).toBe(200);
      
      const checkRes = await request(app)
        .get(`/api/v1/organizations/${organizationId}/projects/${projectId}/queues/${queueId}/schedules/${scheduleId}`)
        .set('Authorization', `Bearer ${authToken}`);
      
      expect(checkRes.status).toBe(404);
    });
  });
});
