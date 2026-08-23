import type { Response } from 'express';

const ts = () => new Date().toISOString();

export function sendSuccess<T>(res: Response, data: T, status = 200) {
  return res.status(status).json({ data, meta: { timestamp: ts() } });
}

export function sendPaginated<T>(
  res: Response,
  data: T[],
  total: number,
  limit: number,
  offset: number,
) {
  return res.status(200).json({ data, meta: { total, limit, offset, timestamp: ts() } });
}

export function sendError(
  res: Response,
  code: string,
  message: string,
  httpStatus = 500,
  details?: unknown[],
) {
  return res.status(httpStatus).json({
    error: code,
    code: httpStatus,
    message,
    ...(details?.length && { details }),
  });
}
