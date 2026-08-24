import { getPool, closePool } from '../shared/config/db';
import { getRedis, closeRedis } from '../shared/config/redis';
import { closeBullMQManager } from '../shared/lib/bullmq-manager';
import { logger } from '../shared/lib/logger';
import { SchedulerLoop } from './scheduler';
import { ListenNotifyClient } from './listen-notify';

async function bootstrap() {
  logger.info('Starting atlas-scheduler...', { service: 'scheduler' });

  // 1. Initialize PostgreSQL
  const pool = getPool();
  try {
    await pool.query('SELECT 1');
    logger.info('Database connected', { service: 'scheduler' });
  } catch (err: any) {
    logger.error('Database connection failed', { error: err.message, service: 'scheduler' });
    process.exit(1);
  }

  // 2. Initialize Redis
  const redis = getRedis();
  try {
    await redis.ping();
    logger.info('Redis connected', { service: 'scheduler' });
  } catch (err: any) {
    logger.error('Redis connection failed', { error: err.message, service: 'scheduler' });
    process.exit(1);
  }

  // 3. Create the SchedulerLoop
  const loop = new SchedulerLoop();

  // 4. Start PostgreSQL LISTEN/NOTIFY
  const notifier = new ListenNotifyClient();
  let debounceTimer: NodeJS.Timeout | null = null;
  
  await notifier.connect(['schedule_changed', 'queue_changed'], (channel, payload) => {
    logger.info(`Received NOTIFY on ${channel}`, { payload, service: 'scheduler' });
    
    // Debounce the notification to request an immediate tick
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(() => {
      logger.info('Requesting immediate scheduler tick due to NOTIFY', { service: 'scheduler' });
      loop.requestImmediateTick();
    }, 100); // 100ms debounce
  });

  // Start the main loop
  const loopPromise = loop.start();

  // 5. Handle SIGTERM and SIGINT (Graceful Shutdown)
  let isShuttingDown = false;
  const shutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    logger.info(`Received ${signal}. Graceful shutdown initiated...`, { service: 'scheduler' });

    try {
      // 1. Stop LISTEN/NOTIFY
      await notifier.disconnect();

      // 2. Stop accepting new scheduler ticks & 3. Wait for active tick to finish
      await loop.stop();

      // Ensure loop actually exited
      await loopPromise;

      // 4. Close BullMQ queue cache
      await closeBullMQManager();

      // 5. Close Redis
      await closeRedis();

      // 5. Close PostgreSQL resources
      await closePool();

      logger.info('Graceful shutdown completed successfully', { service: 'scheduler' });
      process.exit(0);
    } catch (err: any) {
      logger.error('Error during graceful shutdown', { error: err.message, service: 'scheduler' });
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
}

bootstrap().catch(err => {
  logger.error('Unhandled fatal error in scheduler bootstrap', { error: err.message, service: 'scheduler' });
  process.exit(1);
});
