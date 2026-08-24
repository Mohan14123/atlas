import type { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { getPool } from '../../shared/config/db';
import { env } from '../../shared/config/env';
import { sendSuccess } from '../../shared/lib/response';
import { AppError, HttpStatus } from '../../shared/lib/errors';

export const RegisterSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(8),
    organization_name: z.string().min(1).max(255),
  }),
});

export const LoginSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(1),
  }),
});

export async function register(req: Request, res: Response, next: NextFunction) {
  const { email, password, organization_name } = req.body;
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Check if user exists
    const { rows: existing } = await client.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.length > 0) {
      throw new AppError('Email already registered', 'EMAIL_IN_USE', HttpStatus.CONFLICT);
    }

    // 2. Hash password and insert User
    const passwordHash = await bcrypt.hash(password, 10);
    const { rows: [user] } = await client.query(
      `INSERT INTO users (id, email, password_hash, created_at)
       VALUES (gen_random_uuid(), $1, $2, NOW())
       RETURNING id, email, created_at`,
      [email, passwordHash]
    );

    // 3. Insert Organization
    const { rows: [org] } = await client.query(
      `INSERT INTO organizations (id, name, created_at)
       VALUES (gen_random_uuid(), $1, NOW())
       RETURNING id, name`,
      [organization_name]
    );

    // 4. Link User to Organization as admin
    await client.query(
      `INSERT INTO organization_members (organization_id, user_id, role)
       VALUES ($1, $2, 'admin')`,
      [org.id, user.id]
    );

    // 5. Insert Default Project for the Organization
    await client.query(
      `INSERT INTO projects (id, organization_id, name, created_at)
       VALUES (gen_random_uuid(), $1, 'Default Project', NOW())`,
      [org.id]
    );

    await client.query('COMMIT');

    // 5. Sign JWT and return
    const token = jwt.sign({ id: user.id, email: user.email }, env.JWT_SECRET, { expiresIn: '7d' });
    sendSuccess(res, {
      token,
      user: { id: user.id, email: user.email },
      organization: { id: org.id, name: org.name }
    }, HttpStatus.CREATED);
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

export async function login(req: Request, res: Response, next: NextFunction) {
  const { email, password } = req.body;
  const pool = getPool();

  try {
    const { rows: [user] } = await pool.query(
      'SELECT id, email, password_hash FROM users WHERE email = $1',
      [email]
    );

    if (!user) {
      throw new AppError('Invalid email or password', 'INVALID_CREDENTIALS', HttpStatus.UNAUTHORIZED);
    }

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      throw new AppError('Invalid email or password', 'INVALID_CREDENTIALS', HttpStatus.UNAUTHORIZED);
    }

    const token = jwt.sign({ id: user.id, email: user.email }, env.JWT_SECRET, { expiresIn: '7d' });
    sendSuccess(res, {
      token,
      user: { id: user.id, email: user.email }
    }, HttpStatus.OK);
  } catch (err) {
    next(err);
  }
}
