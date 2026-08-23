export class Semaphore {
  private permits: number;
  private queue: Array<() => void> = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  /**
   * Acquire a permit. Resolves when a permit is available.
   */
  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits -= 1;
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      this.queue.push(() => {
        this.permits -= 1;
        resolve();
      });
    });
  }

  /**
   * Release a permit.
   */
  release(): void {
    this.permits += 1;
    if (this.queue.length > 0 && this.permits > 0) {
      const next = this.queue.shift();
      if (next) {
        next();
      }
    }
  }

  /**
   * Get the number of available permits.
   */
  get availablePermits(): number {
    return this.permits;
  }
}
