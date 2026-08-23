import { env } from '../shared/config/env';
import { logger } from '../shared/lib/logger';
import { detectStaleWorkers } from './jobs/detectStaleWorkers';
import { recoverOrphanedJobs } from './jobs/recoverOrphanedJobs';
import { promoteDelayedJobs } from './jobs/promoteDelayedJobs';
import { retryFailedJobs } from './jobs/retryFailedJobs';
import { createDueJobs } from './jobs/createDueJobs';
import { reconcile } from './jobs/reconcile';

export class SchedulerLoop {
  private stopping = false;
  private currentTimeout: NodeJS.Timeout | null = null;
  private activeTickPromise: Promise<void> | null = null;
  private intervalMs = env.SCHEDULER_INTERVAL_MS || 10000;

  async start() {
    this.stopping = false;
    logger.info('Scheduler loop starting', { service: 'scheduler', intervalMs: this.intervalMs });
    
    while (!this.stopping) {
      this.activeTickPromise = this.tick();
      await this.activeTickPromise;
      this.activeTickPromise = null;
      
      if (!this.stopping) {
        await this.sleep(this.intervalMs);
      }
    }
  }

  /**
   * Request an immediate tick (e.g., from LISTEN/NOTIFY).
   * If a tick is already running, it will not start another one concurrently.
   */
  requestImmediateTick() {
    if (!this.activeTickPromise && !this.stopping) {
      if (this.currentTimeout) {
        clearTimeout(this.currentTimeout);
        this.currentTimeout = null;
      }
      // This will break the sleep and immediately continue the while loop
    }
  }

  private async tick() {
    // 1. detect stale workers
    await detectStaleWorkers().catch(err => {
      logger.error('Tick error in detectStaleWorkers', { error: err.message, service: 'scheduler' });
    });

    // 2. recover orphaned jobs
    await recoverOrphanedJobs().catch(err => {
      logger.error('Tick error in recoverOrphanedJobs', { error: err.message, service: 'scheduler' });
    });

    // 3. promote delayed jobs
    await promoteDelayedJobs().catch(err => {
      logger.error('Tick error in promoteDelayedJobs', { error: err.message, service: 'scheduler' });
    });

    // 4. retry eligible failed jobs
    await retryFailedJobs().catch(err => {
      logger.error('Tick error in retryFailedJobs', { error: err.message, service: 'scheduler' });
    });

    // 5. create due scheduled jobs
    await createDueJobs().catch(err => {
      logger.error('Tick error in createDueJobs', { error: err.message, service: 'scheduler' });
    });

    // 6. reconcile missing BullMQ jobs
    await reconcile().catch(err => {
      logger.error('Tick error in reconcile', { error: err.message, service: 'scheduler' });
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => {
      this.currentTimeout = setTimeout(() => {
        this.currentTimeout = null;
        resolve();
      }, ms);
    });
  }

  async stop() {
    logger.info('Stopping scheduler loop...', { service: 'scheduler' });
    this.stopping = true;
    if (this.currentTimeout) {
      clearTimeout(this.currentTimeout);
      this.currentTimeout = null;
    }
    
    if (this.activeTickPromise) {
      logger.info('Waiting for active tick to finish...', { service: 'scheduler' });
      await this.activeTickPromise;
    }
    logger.info('Scheduler loop stopped', { service: 'scheduler' });
  }
}
