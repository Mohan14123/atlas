import request from 'supertest';
import { createApp } from '../../src/api/app';
import { closePool } from '../../src/shared/config/db';

const app = createApp();

describe('Metrics API', () => {
  let token: string;
  const uid = Date.now().toString();

  beforeAll(async () => {
    const regRes = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: `metrics-${uid}@example.com`,
        password: 'password123',
        organization_name: `MetricsOrg-${uid}`,
      });
    token = regRes.body.data.token;
  });

  afterAll(async () => {
    await closePool();
  });

  describe('GET /metrics', () => {
    it('should return system-wide metrics', async () => {
      const res = await request(app)
        .get('/api/v1/metrics')
        .set('Authorization', `Bearer ${token}`);
      
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('window', '1h');
      expect(res.body.data).toHaveProperty('jobs');
      expect(res.body.data.jobs).toHaveProperty('total_queued');
      expect(res.body.data).toHaveProperty('queues');
      expect(Array.isArray(res.body.data.queues)).toBe(true);
      expect(res.body.data).toHaveProperty('workers');
      expect(res.body.data.workers).toHaveProperty('total');
      expect(res.body.data).toHaveProperty('scheduler');
    });

    it('should accept different window parameters', async () => {
      const res = await request(app)
        .get('/api/v1/metrics?window=24h')
        .set('Authorization', `Bearer ${token}`);
      
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('window', '24h');
    });
  });
});
