import request from 'supertest';
import { createApp } from '../../src/api/app';
import { getPool, closePool } from '../../src/shared/config/db';

const app = createApp();

describe('Projects API', () => {
  let authToken = '';
  let organizationId = '';
  let projectId = '';
  const uniqueSuffix = Date.now().toString();

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: `projtest-${uniqueSuffix}@example.com`,
        password: 'password123',
        organization_name: 'Project Test Org',
      });
    
    expect(res.status).toBe(201);
    expect(res.body.data).toHaveProperty('token');

    authToken = res.body.data.token;
    organizationId = res.body.data.organization.id;
  });

  afterAll(async () => {
    await closePool();
  });

  describe('POST /api/v1/organizations/:orgId/projects', () => {
    it('should create a new project', async () => {
      const res = await request(app)
        .post(`/api/v1/organizations/${organizationId}/projects`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Main Project' });

      expect(res.status).toBe(201);
      expect(res.body.data.project).toHaveProperty('id');
      expect(res.body.data.project.name).toBe('Main Project');
      
      projectId = res.body.data.project.id;
    });
  });

  describe('GET /api/v1/organizations/:orgId/projects', () => {
    it('should list projects in the organization', async () => {
      const res = await request(app)
        .get(`/api/v1/organizations/${organizationId}/projects`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data.projects)).toBe(true);
      expect(res.body.data.projects.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data.projects[0].id).toBe(projectId);
    });
  });

  describe('GET /api/v1/organizations/:orgId/projects/:projectId', () => {
    it('should get a specific project', async () => {
      const res = await request(app)
        .get(`/api/v1/organizations/${organizationId}/projects/${projectId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.project.id).toBe(projectId);
      expect(res.body.data.project.name).toBe('Main Project');
    });
  });

  describe('PUT /api/v1/organizations/:orgId/projects/:projectId', () => {
    it('should update project name', async () => {
      const res = await request(app)
        .put(`/api/v1/organizations/${organizationId}/projects/${projectId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Updated Project' });

      expect(res.status).toBe(200);
      expect(res.body.data.project.name).toBe('Updated Project');
    });
  });

  describe('DELETE /api/v1/organizations/:orgId/projects/:projectId', () => {
    it('should delete the project', async () => {
      const res = await request(app)
        .delete(`/api/v1/organizations/${organizationId}/projects/${projectId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.message).toBe('Project deleted successfully');

      // Verify deletion
      const getRes = await request(app)
        .get(`/api/v1/organizations/${organizationId}/projects/${projectId}`)
        .set('Authorization', `Bearer ${authToken}`);
      
      expect(getRes.status).toBe(404);
    });
  });
});
