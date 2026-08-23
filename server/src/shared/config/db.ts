import { Pool } from 'pg';
import { env } from './env';

let _pool: Pool | null = null;

export function getPool(): Pool {
  if (!_pool) {
    _pool = new Pool({
      connectionString: env.DATABASE_URL,
      max: env.NODE_ENV === 'test' ? 3 : 20,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
    _pool.on('error', (err) => {
      console.error('[db] Pool error', err.message);
    });
  }
  return _pool;
}

export async function closePool(): Promise<void> {
  if (_pool) { await _pool.end(); _pool = null; }
}
