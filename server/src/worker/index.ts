import { getPool } from '../shared/config/db';
import { getRedis } from '../shared/config/redis';
import { logger } from '../shared/lib/logger';
import { JobRegistry } from './registry';
import { registerHandlers } from './handlers';
import { WorkerHeartbeat } from './heartbeat';
import { AtlasWorker } from './worker';
import { setupGracefulShutdown } from './shutdown';

/**
 * Bootstraps the Atlas Worker Service.
 */
export async function startWorkerService() {
  logger.info('Starting Atlas Worker Service...', { service: 'worker' });

  // Connect to dependencies
  await getPool().connect();
  getRedis();

  const concurrency = parseInt(process.env.WORKER_CONCURRENCY || '10', 10);
  logger.info(`Configured concurrency: ${concurrency}`, { service: 'worker' });

  // Initialize registry and handlers
  const registry = new JobRegistry();
  registerHandlers(registry);

  // Initialize heartbeat manager
  const heartbeat = new WorkerHeartbeat(concurrency);
  await heartbeat.start();

  // Initialize and start worker
  const worker = new AtlasWorker(concurrency, registry, heartbeat);
  await worker.start();

  // Setup graceful shutdown
  setupGracefulShutdown(worker, heartbeat);
}

// Run directly if called as a script
if (require.main === module) {
  startWorkerService().catch((err) => {
    logger.error('Failed to start Atlas Worker Service', { error: err.message, service: 'worker' });
    process.exit(1);
  });
}
