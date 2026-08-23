import { JobRegistry } from './registry';
import { logger } from '../shared/lib/logger';

export function registerHandlers(registry: JobRegistry): void {
  // Test handler
  registry.register('test', async (payload: any) => {
    logger.info('Executing test job', { payload, service: 'worker' });
    
    // Simulate work
    const duration = payload?.duration || 1000;
    await new Promise(resolve => setTimeout(resolve, duration));
    
    if (payload?.shouldFail) {
      throw new Error(payload.error || 'Test job failed intentionally');
    }
    
    return { success: true, executedAt: new Date().toISOString() };
  });

  // Export data handler (dummy)
  registry.register('export-data', async (payload: any) => {
    logger.info('Executing export-data job', { payload, service: 'worker' });
    await new Promise(resolve => setTimeout(resolve, 5000));
    return { url: 'https://example.com/export.csv' };
  });

  // Send email handler (dummy)
  registry.register('send-email', async (payload: any) => {
    logger.info('Executing send-email job', { payload, service: 'worker' });
    await new Promise(resolve => setTimeout(resolve, 500));
    return { delivered: true };
  });
}
