import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError, HttpStatus } from '../../shared/lib/errors';
import { sendError } from '../../shared/lib/response';
import { logger } from '../../shared/lib/logger';

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (err instanceof AppError) {
    return sendError(res, err.code, err.message, err.httpStatus);
  }

  if (err instanceof ZodError) {
    const details = err.errors.map((e) => ({
      field: e.path.join('.'),
      message: e.message,
    }));
    return sendError(res, 'VALIDATION_ERROR', 'Invalid request payload', HttpStatus.BAD_REQUEST, details);
  }

  logger.error('Unhandled Exception', { error: err.message, stack: err.stack, path: req.path });
  
  return sendError(
    res,
    'INTERNAL_SERVER_ERROR',
    'An unexpected error occurred',
    HttpStatus.INTERNAL
  );
}
