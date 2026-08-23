import { logger } from '../shared/lib/logger';
import { getPool } from '../shared/config/db';
import { getRedis } from '../shared/config/redis';
import type { AtlasWorker } from './worker';
import type { WorkerHeartbeat } from './heartbeat';

export function setupGracefulShutdown(worker: AtlasWorker, heartbeat: WorkerHeartbeat): void {
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down Atlas Worker Service gracefully...`, { service: 'worker' });

    try {
      // 1. Stop consuming new jobs
      await worker.close();
      
      // 2. Stop heartbeat and mark offline
      await heartbeat.stop();

      // 3. Close Redis connection
      const redis = getRedis();
      redis.disconnect();
      logger.info('Redis connection closed', { service: 'worker' });

      // 4. Close Postgres pool
      await getPool().end();
      logger.info('Postgres pool closed', { service: 'worker' });

      logger.info('Graceful shutdown completed successfully', { service: 'worker' });
      process.exit(0);
    } catch (err: any) {
      logger.error('Error during graceful shutdown', { error: err.message, service: 'worker' });
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
