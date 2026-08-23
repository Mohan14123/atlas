import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../../shared/config/env';
import { AppError, HttpStatus } from '../../shared/lib/errors';

export interface AuthUser {
  id: string;
  email: string;
}


export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    throw new AppError('Authentication required', 'UNAUTHORIZED', HttpStatus.UNAUTHORIZED);
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as AuthUser;
    req.user = decoded;
    next();
  } catch (err) {
    throw new AppError('Invalid or expired token', 'UNAUTHORIZED', HttpStatus.UNAUTHORIZED);
  }
}
