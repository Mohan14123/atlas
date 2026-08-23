import 'dotenv/config';
import { z } from 'zod';

const Schema = z.object({
  DATABASE_URL:          z.string().min(1),
  REDIS_URL:             z.string().default('redis://localhost:6379'),
  JWT_SECRET:            z.string().min(16),
  PORT:                  z.coerce.number().default(4000),
  WORKER_CONCURRENCY:    z.coerce.number().default(5),
  SCHEDULER_INTERVAL_MS: z.coerce.number().default(5000),
  NODE_ENV:              z.enum(['development', 'production', 'test']).default('development'),
});

const result = Schema.safeParse(process.env);
if (!result.success) {
  console.error('[env] Missing/invalid vars:', result.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = result.data;
export type Env = typeof env;
