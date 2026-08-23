import request from 'supertest';
import { createApp } from '../../src/api/app';
import { getPool, closePool } from '../../src/shared/config/db';
import { moveToDLQ } from '../../src/shared/db/queries/dlq';

const app = createApp();

describe('DLQ API', () => {
  let token: string;
  let queueId: string;
  let projectId: string;
  let dlqEntryId: string;
  let jobId: string;

  const uid = Date.now().toString();

  beforeAll(async () => {
    // 1. Setup user/org/project/queue
    const regRes = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: `dlqtest-${uid}@example.com`,
        password: 'password123',
        organization_name: `DLQTestOrg-${uid}`,
      });
    token = regRes.body.data.token;
    const orgId = regRes.body.data.organization.id;

    const projRes = await request(app)
      .post(`/api/v1/organizations/${orgId}/projects`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `DLQTestProject-${uid}` });
    projectId = projRes.body.data.project.id;

    const queueRes = await request(app)
      .post(`/api/v1/organizations/${orgId}/projects/${projectId}/queues`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `dlq-queue-${uid}`, concurrency_limit: 10 });
    queueId = queueRes.body.data.queue.id;

    // 2. Create a Job
    const jobRes = await request(app)
      .post(`/api/v1/organizations/_/projects/${projectId}/queues/${queueId}/jobs`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        type: 'faulty-task',
        priority: 5,
        payload: { will_fail: true },
        job_mode: 'immediate',
      });
    jobId = jobRes.body.data.id;

    // 3. Move it to DLQ using the DB helper (simulating worker exhaustion)
    const pool = getPool();
    await pool.query('UPDATE jobs SET status = $1 WHERE id = $2', ['RUNNING', jobId]);
    await moveToDLQ(pool, jobId, 'MAX_ATTEMPTS_EXCEEDED', 'Failed after 3 retries', 3);

    // Fetch the inserted DLQ entry ID
    const { rows } = await pool.query('SELECT id FROM dead_letter_queue WHERE job_id = $1', [jobId]);
    dlqEntryId = rows[0].id;
  });

  afterAll(async () => {
    await closePool();
  });

  describe('GET /dlq', () => {
    it('should list dlq entries', async () => {
      const res = await request(app)
        .get('/api/v1/dlq')
        .set('Authorization', `Bearer ${token}`);
      
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.data[0]).toHaveProperty('job');
      expect(res.body.data[0].job.type).toBe('faulty-task');
    });

    it('should filter by queue_id', async () => {
      const res = await request(app)
        .get(`/api/v1/dlq?queue_id=${queueId}`)
        .set('Authorization', `Bearer ${token}`);
      
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);
    });

    it('should return empty list for non-matching queue_id', async () => {
      const res = await request(app)
        .get(`/api/v1/dlq?queue_id=00000000-0000-0000-0000-000000000000`)
        .set('Authorization', `Bearer ${token}`);
      
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(0);
    });
  });

  describe('GET /dlq/:entryId', () => {
    it('should get dlq entry details', async () => {
      const res = await request(app)
        .get(`/api/v1/dlq/${dlqEntryId}`)
        .set('Authorization', `Bearer ${token}`);
      
      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(dlqEntryId);
      expect(res.body.data.job.id).toBe(jobId);
      expect(res.body.data).toHaveProperty('executions'); // even if empty array
    });

    it('should return 404 for non-existent dlq entry', async () => {
      const res = await request(app)
        .get('/api/v1/dlq/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${token}`);
      
      expect(res.status).toBe(404);
    });
  });

  describe('POST /dlq/:entryId/replay', () => {
    it('should replay a DLQ entry successfully', async () => {
      const res = await request(app)
        .post(`/api/v1/dlq/${dlqEntryId}/replay`)
        .set('Authorization', `Bearer ${token}`);
      
      expect(res.status).toBe(201);
      expect(res.body.data.dlq_entry_id).toBe(dlqEntryId);
      expect(res.body.data.new_job.status).toBe('QUEUED');
      
      const newJobId = res.body.data.new_job.id;

      // Verify old entry is gone
      const getRes = await request(app)
        .get(`/api/v1/dlq/${dlqEntryId}`)
        .set('Authorization', `Bearer ${token}`);
      expect(getRes.status).toBe(404);

      // Verify new job exists
      const jobRes = await request(app)
        .get(`/api/v1/jobs/${newJobId}`)
        .set('Authorization', `Bearer ${token}`);
      expect(jobRes.status).toBe(200);
      expect(jobRes.body.data.payload.will_fail).toBe(true);
    });
  });
});
