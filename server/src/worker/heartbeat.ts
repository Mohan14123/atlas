import { hostname } from 'os';
import { getPool } from '../shared/config/db';
import { registerWorker, upsertHeartbeat } from '../shared/db/queries/workers';
import { logger } from '../shared/lib/logger';

export class WorkerHeartbeat {
  private workerId: string | null = null;
  private intervalId: NodeJS.Timeout | null = null;
  private readonly concurrency: number;
  private activeJobsCount: number = 0;
  private readonly intervalMs = 10_000; // 10 seconds

  constructor(concurrency: number) {
    this.concurrency = concurrency;
  }

  async start(): Promise<string> {
    const pool = getPool();
    const host = hostname();
    
    // Register the worker in the database
    this.workerId = await registerWorker(pool, host, this.concurrency);
    logger.info(`Worker registered with ID ${this.workerId} on host ${host}`);

    // Send initial heartbeat
    await this.sendHeartbeat();

    // Start periodic heartbeat
    this.intervalId = setInterval(() => {
      this.sendHeartbeat().catch((err) => {
        logger.error('Failed to send heartbeat', { error: err.message, worker_id: this.workerId });
      });
    }, this.intervalMs);

    return this.workerId;
  }

  async stop(): Promise<void> {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    
    if (this.workerId) {
      // Mark as offline if we wanted to, but for now we just stop sending heartbeats
      const pool = getPool();
      try {
        await pool.query('UPDATE workers SET status = $2 WHERE id = $1', [this.workerId, 'offline']);
        logger.info(`Worker ${this.workerId} marked as offline`);
      } catch (err: any) {
        logger.error('Failed to mark worker offline', { error: err.message, worker_id: this.workerId });
      }
    }
  }

  setActiveJobsCount(count: number): void {
    this.activeJobsCount = count;
  }

  getWorkerId(): string | null {
    return this.workerId;
  }

  private async sendHeartbeat(): Promise<void> {
    if (!this.workerId) return;
    
    const pool = getPool();
    await upsertHeartbeat(pool, this.workerId, this.activeJobsCount);
  }
}
