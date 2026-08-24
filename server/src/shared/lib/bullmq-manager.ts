import { Queue as BullQueue } from 'bullmq';
import Redis from 'ioredis';
import { env } from '../config/env';
import { logger } from './logger';

/**
 * Manages BullMQ Queue instances with connection reuse.
 *
 * Instead of creating and closing a BullQueue per enqueue call (O(queues × ticks)),
 * this manager caches Queue instances per queue ID and shares a single dedicated
 * Redis connection across all of them. Queue instances are only created on first
 * use and cleaned up deterministically on shutdown.
 *
 * Thread-safety note: This class is designed for single-process use (Node.js).
 * The Map operations are synchronous and safe within the event loop.
 */
export class BullMQManager {
  private queues: Map<string, BullQueue> = new Map();
  private readonly connection: Redis;
  private closed = false;

  constructor() {
    // Dedicated Redis connection for BullMQ Queue instances (not shared with workers)
    this.connection = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: null,  // required by BullMQ
      lazyConnect: true,
    });
    this.connection.on('error', (err) => {
      logger.error('BullMQManager Redis error', { error: err.message, service: 'bullmq-manager' });
    });
  }

  /**
   * Returns a cached BullQueue for the given queue ID, creating one if needed.
   * The queue name follows the atlas_<queueId> convention.
   */
  getQueue(queueId: string): BullQueue {
    if (this.closed) {
      throw new Error('BullMQManager is closed — cannot get queue');
    }

    let queue = this.queues.get(queueId);
    if (!queue) {
      queue = new BullQueue(`atlas_${queueId}`, { connection: this.connection });
      this.queues.set(queueId, queue);
    }
    return queue;
  }

  /**
   * Enqueues a job to BullMQ for the given queue. Uses idempotent job IDs.
   * If the queue doesn't exist yet, creates it.
   */
  async enqueue(queueId: string, jobType: string, jobId: string): Promise<void> {
    const queue = this.getQueue(queueId);
    await queue.add(jobType, { jobId }, { jobId });
  }

  /**
   * Closes and removes a specific queue from the cache.
   */
  async removeQueue(queueId: string): Promise<void> {
    const queue = this.queues.get(queueId);
    if (queue) {
      this.queues.delete(queueId);
      await queue.close();
    }
  }

  /**
   * Closes all cached queues and the shared Redis connection.
   * After this call, the manager is no longer usable.
   */
  async closeAll(): Promise<void> {
    this.closed = true;
    const closePromises = Array.from(this.queues.values()).map(q => q.close());
    await Promise.all(closePromises);
    this.queues.clear();
    await this.connection.quit();
    logger.info('BullMQManager closed', { service: 'bullmq-manager' });
  }

  /** Number of cached queue instances. Useful for metrics/debugging. */
  get size(): number {
    return this.queues.size;
  }
}

// Singleton instance — lazily created, shared across scheduler and API
let _manager: BullMQManager | null = null;

export function getBullMQManager(): BullMQManager {
  if (!_manager) {
    _manager = new BullMQManager();
  }
  return _manager;
}

export async function closeBullMQManager(): Promise<void> {
  if (_manager) {
    await _manager.closeAll();
    _manager = null;
  }
}
