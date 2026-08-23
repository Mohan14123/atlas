import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { getPool } from '../../shared/config/db';
import { sendSuccess } from '../../shared/lib/response';
import { AppError, HttpStatus } from '../../shared/lib/errors';

export const CreateProjectSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(255),
  }),
});

export const UpdateProjectSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(255),
  }),
});

// Middleware helper to check if user belongs to the org
async function verifyOrgAccess(orgId: string, userId: string): Promise<void> {
  const pool = getPool();
  const { rows } = await pool.query(
    'SELECT 1 FROM organization_members WHERE organization_id = $1 AND user_id = $2',
    [orgId, userId]
  );
  if (rows.length === 0) {
    throw new AppError('Organization not found or unauthorized', 'NOT_FOUND', HttpStatus.NOT_FOUND);
  }
}

export async function listProjects(req: Request, res: Response, next: NextFunction) {
  const userId = req.user!.id;
  const orgId = req.params.orgId as string;
  const pool = getPool();

  try {
    await verifyOrgAccess(orgId, userId);

    const { rows } = await pool.query(
      `SELECT id, organization_id, name, created_at, updated_at
       FROM   projects
       WHERE  organization_id = $1
       ORDER  BY created_at DESC`,
      [orgId]
    );

    sendSuccess(res, { projects: rows });
  } catch (err) {
    next(err);
  }
}

export async function createProject(req: Request, res: Response, next: NextFunction) {
  const userId = req.user!.id;
  const orgId = req.params.orgId as string;
  const { name } = req.body;
  const pool = getPool();

  try {
    await verifyOrgAccess(orgId, userId);

    const { rows: [project] } = await pool.query(
      `INSERT INTO projects (id, organization_id, name, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, NOW(), NOW())
       RETURNING id, organization_id, name, created_at, updated_at`,
      [orgId, name]
    );

    sendSuccess(res, { project }, HttpStatus.CREATED);
  } catch (err) {
    if ((err as any).code === '23505') { // unique_violation
      return next(new AppError('Project name must be unique within the organization', 'CONFLICT', HttpStatus.CONFLICT));
    }
    next(err);
  }
}

export async function getProject(req: Request, res: Response, next: NextFunction) {
  const userId = req.user!.id;
  const orgId = req.params.orgId as string;
  const projectId = req.params.projectId as string;
  const pool = getPool();

  try {
    await verifyOrgAccess(orgId, userId);

    const { rows: [project] } = await pool.query(
      `SELECT id, organization_id, name, created_at, updated_at
       FROM   projects
       WHERE  organization_id = $1 AND id = $2`,
      [orgId, projectId]
    );

    if (!project) {
      throw new AppError('Project not found', 'NOT_FOUND', HttpStatus.NOT_FOUND);
    }

    sendSuccess(res, { project });
  } catch (err) {
    next(err);
  }
}

export async function updateProject(req: Request, res: Response, next: NextFunction) {
  const userId = req.user!.id;
  const orgId = req.params.orgId as string;
  const projectId = req.params.projectId as string;
  const { name } = req.body;
  const pool = getPool();

  try {
    await verifyOrgAccess(orgId, userId);

    const { rows: [project] } = await pool.query(
      `UPDATE projects
       SET    name = $1, updated_at = NOW()
       WHERE  organization_id = $2 AND id = $3
       RETURNING id, organization_id, name, created_at, updated_at`,
      [name, orgId, projectId]
    );

    if (!project) {
      throw new AppError('Project not found', 'NOT_FOUND', HttpStatus.NOT_FOUND);
    }

    sendSuccess(res, { project });
  } catch (err) {
    if ((err as any).code === '23505') {
      return next(new AppError('Project name must be unique within the organization', 'CONFLICT', HttpStatus.CONFLICT));
    }
    next(err);
  }
}

export async function deleteProject(req: Request, res: Response, next: NextFunction) {
  const userId = req.user!.id;
  const orgId = req.params.orgId as string;
  const projectId = req.params.projectId as string;
  const pool = getPool();

  try {
    await verifyOrgAccess(orgId, userId);

    const { rowCount } = await pool.query(
      `DELETE FROM projects WHERE organization_id = $1 AND id = $2`,
      [orgId, projectId]
    );

    if (rowCount === 0) {
      throw new AppError('Project not found', 'NOT_FOUND', HttpStatus.NOT_FOUND);
    }

    sendSuccess(res, { message: 'Project deleted successfully' });
  } catch (err) {
    next(err);
  }
}
