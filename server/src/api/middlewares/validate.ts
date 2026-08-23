import type { Request, Response, NextFunction } from 'express';
import { AnyZodObject, ZodError } from 'zod';
import { AppError, HttpStatus } from '../../shared/lib/errors';
import { sendError } from '../../shared/lib/response';

export const validate = (schema: AnyZodObject) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      // Replace req objects with validated (and potentially coerced) data
      req.body = parsed.body;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const details = error.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        }));
        return sendError(res, 'VALIDATION_ERROR', 'Invalid request payload', HttpStatus.BAD_REQUEST, details);
      }
      next(error);
    }
  };
};
