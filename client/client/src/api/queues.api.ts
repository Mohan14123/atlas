import { apiClient } from './client';
import { APIResponse, PaginatedResponse, Queue, QueueStats } from '../types/api.types';

const MOCK_ENABLED = import.meta.env.VITE_USE_MOCK === 'true';

const mockQueues: Queue[] = [
  {
    id: 'q-1',
    project_id: 'p-1',
    name: 'security-scans',
    priority: 10,
    concurrency_limit: 5,
    is_paused: false,
    retry_policy: { strategy: 'exponential', max_attempts: 3, initial_delay_ms: 1000, max_delay_ms: 60000 },
    created_at: new Date().toISOString()
  },
  {
    id: 'q-2',
    project_id: 'p-1',
    name: 'reports',
    priority: 5,
    concurrency_limit: 10,
    is_paused: true,
    retry_policy: { strategy: 'fixed', max_attempts: 1, initial_delay_ms: 0, max_delay_ms: 0 },
    created_at: new Date().toISOString()
  }
];

export const queuesApi = {
  list: async (projectId: string): Promise<PaginatedResponse<Queue>> => {
    if (MOCK_ENABLED) {
      return {
        data: mockQueues,
        meta: { total: 2, limit: 20, offset: 0, timestamp: new Date().toISOString() }
      };
    }
    const res = await apiClient.get(`/projects/${projectId}/queues`);
    return res.data;
  },
  get: async (queueId: string): Promise<APIResponse<Queue>> => {
    if (MOCK_ENABLED) {
      const q = mockQueues.find(q => q.id === queueId) || mockQueues[0];
      return { data: q, meta: { timestamp: new Date().toISOString() } };
    }
    const res = await apiClient.get(`/queues/${queueId}`);
    return res.data;
  },
  pause: async (queueId: string): Promise<APIResponse<any>> => {
    if (MOCK_ENABLED) return { data: { id: queueId, is_paused: true }, meta: { timestamp: '' } };
    const res = await apiClient.put(`/queues/${queueId}/pause`);
    return res.data;
  },
  resume: async (queueId: string): Promise<APIResponse<any>> => {
    if (MOCK_ENABLED) return { data: { id: queueId, is_paused: false }, meta: { timestamp: '' } };
    const res = await apiClient.put(`/queues/${queueId}/resume`);
    return res.data;
  },
  stats: async (queueId: string): Promise<APIResponse<QueueStats>> => {
    if (MOCK_ENABLED) {
      return {
        data: {
          queue_id: queueId,
          queue_name: 'security-scans',
          is_paused: false,
          counts: { scheduled: 12, queued: 5, claimed: 2, running: 2, completed: 438, failed: 7, dlq: 3 },
          concurrency_limit: 5,
          active_workers: 3,
          throughput_last_hour: 142
        },
        meta: { timestamp: new Date().toISOString() }
      };
    }
    const res = await apiClient.get(`/queues/${queueId}/stats`);
    return res.data;
  }
};
