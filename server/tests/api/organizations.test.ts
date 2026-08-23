import request from 'supertest';
import { createApp } from '../../src/api/app';
import { getPool, closePool } from '../../src/shared/config/db';

const app = createApp();

describe('Organizations API', () => {
  let authToken = '';
  let organizationId = '';
  const uniqueSuffix = Date.now().toString();

  beforeAll(async () => {
    // Register a user to get token and initial organization
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: `orgtest-${uniqueSuffix}@example.com`,
        password: 'password123',
        organization_name: 'Initial Org',
      });
    
    expect(res.status).toBe(201);
    expect(res.body.data).toHaveProperty('token');

    authToken = res.body.data.token;
    organizationId = res.body.data.organization.id;
  });

  afterAll(async () => {
    await closePool();
  });

  describe('GET /api/v1/organizations', () => {
    it('should list organizations for the user', async () => {
      const res = await request(app)
        .get('/api/v1/organizations')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data.organizations)).toBe(true);
      expect(res.body.data.organizations.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data.organizations[0].id).toBe(organizationId);
    });
  });

  describe('POST /api/v1/organizations', () => {
    it('should create a new organization', async () => {
      const res = await request(app)
        .post('/api/v1/organizations')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Secondary Org' });

      expect(res.status).toBe(201);
      expect(res.body.data.organization).toHaveProperty('id');
      expect(res.body.data.organization.name).toBe('Secondary Org');
    });
  });

  describe('GET /api/v1/organizations/:orgId', () => {
    it('should get a specific organization', async () => {
      const res = await request(app)
        .get(`/api/v1/organizations/${organizationId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.organization.id).toBe(organizationId);
      expect(res.body.data.organization.name).toBe('Initial Org');
      expect(res.body.data.organization.role).toBe('admin');
    });
  });

  describe('PUT /api/v1/organizations/:orgId', () => {
    it('should update the organization name', async () => {
      const res = await request(app)
        .put(`/api/v1/organizations/${organizationId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Updated Initial Org' });

      expect(res.status).toBe(200);
      expect(res.body.data.organization.name).toBe('Updated Initial Org');
    });
  });

  describe('DELETE /api/v1/organizations/:orgId', () => {
    it('should delete the organization', async () => {
      // First create a temp org to delete
      const createRes = await request(app)
        .post('/api/v1/organizations')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Org to delete' });
      
      const tempOrgId = createRes.body.data.organization.id;

      const deleteRes = await request(app)
        .delete(`/api/v1/organizations/${tempOrgId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(deleteRes.status).toBe(200);
      expect(deleteRes.body.data.message).toBe('Organization deleted successfully');

      // Verify deletion
      const getRes = await request(app)
        .get(`/api/v1/organizations/${tempOrgId}`)
        .set('Authorization', `Bearer ${authToken}`);
      
      expect(getRes.status).toBe(404);
    });
  });
});
