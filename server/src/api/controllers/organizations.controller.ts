import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { getPool } from '../../shared/config/db';
import { sendSuccess } from '../../shared/lib/response';
import { AppError, HttpStatus } from '../../shared/lib/errors';

export const CreateOrganizationSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(255),
  }),
});

export const UpdateOrganizationSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(255),
  }),
});

export async function listOrganizations(req: Request, res: Response, next: NextFunction) {
  const userId = req.user!.id;
  const pool = getPool();

  try {
    const { rows } = await pool.query(
      `SELECT o.id, o.name, o.created_at
       FROM   organizations o
       JOIN   organization_members om ON o.id = om.organization_id
       WHERE  om.user_id = $1
       ORDER  BY o.created_at DESC`,
      [userId]
    );

    sendSuccess(res, { organizations: rows });
  } catch (err) {
    next(err);
  }
}

export async function createOrganization(req: Request, res: Response, next: NextFunction) {
  const userId = req.user!.id;
  const { name } = req.body;
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    
    const { rows: [org] } = await client.query(
      `INSERT INTO organizations (id, name, created_at)
       VALUES (gen_random_uuid(), $1, NOW())
       RETURNING id, name, created_at`,
      [name]
    );

    await client.query(
      `INSERT INTO organization_members (organization_id, user_id, role)
       VALUES ($1, $2, 'admin')`,
      [org.id, userId]
    );

    await client.query('COMMIT');
    sendSuccess(res, { organization: org }, HttpStatus.CREATED);
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

export async function getOrganization(req: Request, res: Response, next: NextFunction) {
  const userId = req.user!.id;
  const { orgId } = req.params;
  const pool = getPool();

  try {
    const { rows: [org] } = await pool.query(
      `SELECT o.id, o.name, o.created_at, om.role
       FROM   organizations o
       JOIN   organization_members om ON o.id = om.organization_id
       WHERE  o.id = $1 AND om.user_id = $2`,
      [orgId, userId]
    );

    if (!org) {
      throw new AppError('Organization not found', 'NOT_FOUND', HttpStatus.NOT_FOUND);
    }

    sendSuccess(res, { organization: org });
  } catch (err) {
    next(err);
  }
}

export async function updateOrganization(req: Request, res: Response, next: NextFunction) {
  const userId = req.user!.id;
  const { orgId } = req.params;
  const { name } = req.body;
  const pool = getPool();

  try {
    // Check access
    const { rows: [member] } = await pool.query(
      `SELECT role FROM organization_members WHERE organization_id = $1 AND user_id = $2`,
      [orgId, userId]
    );

    if (!member || member.role !== 'admin') {
      throw new AppError('Unauthorized', 'UNAUTHORIZED', HttpStatus.UNAUTHORIZED);
    }

    const { rows: [org] } = await pool.query(
      `UPDATE organizations SET name = $1, updated_at = NOW() WHERE id = $2 RETURNING id, name, updated_at`,
      [name, orgId]
    );

    sendSuccess(res, { organization: org });
  } catch (err) {
    next(err);
  }
}

export async function deleteOrganization(req: Request, res: Response, next: NextFunction) {
  const userId = req.user!.id;
  const { orgId } = req.params;
  const pool = getPool();

  try {
    const { rows: [member] } = await pool.query(
      `SELECT role FROM organization_members WHERE organization_id = $1 AND user_id = $2`,
      [orgId, userId]
    );

    if (!member || member.role !== 'admin') {
      throw new AppError('Unauthorized', 'UNAUTHORIZED', HttpStatus.UNAUTHORIZED);
    }

    await pool.query(`DELETE FROM organizations WHERE id = $1`, [orgId]);
    sendSuccess(res, { message: 'Organization deleted successfully' });
  } catch (err) {
    next(err);
  }
}
