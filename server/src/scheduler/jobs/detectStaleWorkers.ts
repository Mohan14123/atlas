import { getPool } from '../../shared/config/db';
import { findStaleWorkers, markWorkerUnhealthy } from '../../shared/db/queries/workers';
import { logger } from '../../shared/lib/logger';

export async function detectStaleWorkers() {
  const pool = getPool();
  try {
    const staleWorkers = await findStaleWorkers(pool, 30_000);
    
    for (const worker of staleWorkers) {
      await markWorkerUnhealthy(pool, worker.id);
      logger.warn(`Marked worker ${worker.id} as unhealthy (stale heartbeat)`, {
        service: 'scheduler',
        worker_id: worker.id,
      });
    }
  } catch (err: any) {
    logger.error('Failed in detectStaleWorkers', { error: err.message, service: 'scheduler' });
    throw err;
  }
}
