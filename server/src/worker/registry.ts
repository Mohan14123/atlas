import { logger } from '../shared/lib/logger';

export type JobHandler = (payload: any) => Promise<any>;

export class JobRegistry {
  private handlers: Map<string, JobHandler> = new Map();

  /**
   * Register a handler for a specific job type.
   */
  register(jobType: string, handler: JobHandler): void {
    if (this.handlers.has(jobType)) {
      logger.warn(`Overwriting existing handler for job type: ${jobType}`, { service: 'worker' });
    }
    this.handlers.set(jobType, handler);
    logger.info(`Registered handler for job type: ${jobType}`, { service: 'worker' });
  }

  /**
   * Get a handler for a specific job type.
   */
  getHandler(jobType: string): JobHandler | undefined {
    return this.handlers.get(jobType);
  }

  /**
   * Check if a handler exists for a specific job type.
   */
  hasHandler(jobType: string): boolean {
    return this.handlers.has(jobType);
  }
}
