import { createApp } from './app';
import { env } from '../shared/config/env';
import { getPool, closePool } from '../shared/config/db';
import { getRedis, closeRedis } from '../shared/config/redis';
import { logger } from '../shared/lib/logger';

async function bootstrap() {
  logger.setService('api');

  try {
    // Warm up connections
    const pool = getPool();
    await pool.query('SELECT 1');
    const redis = getRedis();
    await redis.ping();

    const app = createApp();
    const server = app.listen(env.PORT, () => {
      logger.info(`atlas-api listening on port ${env.PORT}`);
    });

    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}, shutting down gracefully...`);
      server.close(async () => {
        try {
          await closePool();
          await closeRedis();
          logger.info('Closed DB and Redis connections');
          process.exit(0);
        } catch (err) {
          logger.error('Error during shutdown', { error: err });
          process.exit(1);
        }
      });

      // Force shutdown after 10s
      setTimeout(() => {
        logger.error('Force shutting down after 10s');
        process.exit(1);
      }, 10_000).unref();
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (err) {
    logger.error('Failed to start atlas-api', { error: err });
    process.exit(1);
  }
}

bootstrap();
