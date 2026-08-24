import { apiClient } from './client';
import { APIResponse, Metrics } from '../types/api.types';

const MOCK_ENABLED = import.meta.env.VITE_USE_MOCK === 'true';

export const metricsApi = {
  getMetrics: async (window: string = '1h'): Promise<APIResponse<Metrics>> => {
    if (MOCK_ENABLED) {
      return {
        data: {
          window,
          jobs: {
            total_queued: 24,
            total_running: 7,
            total_completed: 438,
            total_failed: 12,
            total_dlq: 3,
            throughput_per_minute: 7.3,
            success_rate: 0.973,
            failure_rate: 0.027,
            retry_rate: 0.089,
            avg_wait_time_ms: 412,
            avg_execution_time_ms: 8820
          },
          queues: [
            { id: 'q-1', name: 'security-scans', depth: 5, is_paused: false, active_jobs: 2, concurrency_limit: 10 }
          ],
          workers: {
            total: 4, active: 3, idle: 1, unhealthy: 0, total_capacity: 20, used_capacity: 7, utilization: 0.35
          },
          scheduler: {
            last_tick_at: new Date().toISOString(),
            due_schedules_evaluated: 12,
            jobs_created_this_hour: 28
          }
        },
        meta: { timestamp: new Date().toISOString() }
      };
    }
    const res = await apiClient.get('/metrics', { params: { window } });
    return res.data;
  }
};
