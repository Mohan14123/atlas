import request from 'supertest';
import { createApp } from '../../src/api/app';
import { getPool, closePool } from '../../src/shared/config/db';

const app = createApp();

describe('Workers API', () => {
  let token: string;
  let workerId: string;
  const uid = Date.now().toString();

  beforeAll(async () => {
    // Register user & login
    const regRes = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: `workers-${uid}@example.com`,
        password: 'password123',
        organization_name: `WorkerOrg-${uid}`,
      });
    token = regRes.body.data.token;

    // Create a worker in DB
    const pool = getPool();
    const { rows } = await pool.query(
      `INSERT INTO workers (id, hostname, status, concurrency)
       VALUES (gen_random_uuid(), $1, 'active', 10)
       RETURNING id`,
      [`worker-${uid}`]
    );
    workerId = rows[0].id;

    // Add a heartbeat
    await pool.query(
      `INSERT INTO worker_heartbeats (id, worker_id, active_jobs)
       VALUES (gen_random_uuid(), $1, 2)`,
      [workerId]
    );
  });

  afterAll(async () => {
    await closePool();
  });

  describe('GET /workers', () => {
    it('should list workers', async () => {
      const res = await request(app)
        .get('/api/v1/workers')
        .set('Authorization', `Bearer ${token}`);
      
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.data[0]).toHaveProperty('hostname');
      expect(res.body.data[0]).toHaveProperty('active_jobs');
      expect(res.body.data[0]).toHaveProperty('last_heartbeat_at');
    });

    it('should filter workers by status', async () => {
      const res = await request(app)
        .get('/api/v1/workers?status=active')
        .set('Authorization', `Bearer ${token}`);
      
      expect(res.status).toBe(200);
      expect(res.body.data.every((w: any) => w.status === 'active')).toBe(true);
    });
  });

  describe('GET /workers/:workerId', () => {
    it('should get a single worker with jobs and heartbeats', async () => {
      const res = await request(app)
        .get(`/api/v1/workers/${workerId}`)
        .set('Authorization', `Bearer ${token}`);
      
      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(workerId);
      expect(res.body.data).toHaveProperty('current_jobs');
      expect(res.body.data).toHaveProperty('recent_heartbeats');
      expect(res.body.data.recent_heartbeats.length).toBeGreaterThan(0);
    });

    it('should return 404 for non-existent worker', async () => {
      const res = await request(app)
        .get('/api/v1/workers/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${token}`);
      
      expect(res.status).toBe(404);
    });
  });
});
