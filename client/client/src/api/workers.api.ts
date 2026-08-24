import { apiClient } from './client';
import { APIResponse, PaginatedResponse, Worker } from '../types/api.types';

const MOCK_ENABLED = import.meta.env.VITE_USE_MOCK === 'true';

const mockWorkers: Worker[] = [
  { id: 'w-1', hostname: 'worker-node-1', status: 'active', concurrency: 5, active_jobs: 3, last_heartbeat_at: new Date().toISOString(), registered_at: new Date(Date.now() - 36000000).toISOString() },
  { id: 'w-2', hostname: 'worker-node-2', status: 'idle', concurrency: 5, active_jobs: 0, last_heartbeat_at: new Date().toISOString(), registered_at: new Date(Date.now() - 36000000).toISOString() },
  { id: 'w-3', hostname: 'worker-node-3', status: 'offline', concurrency: 5, active_jobs: 0, last_heartbeat_at: new Date(Date.now() - 600000).toISOString(), registered_at: new Date(Date.now() - 36000000).toISOString() },
];

export const workersApi = {
  list: async (filters: any): Promise<PaginatedResponse<Worker>> => {
    if (MOCK_ENABLED) return { data: mockWorkers, meta: { total: 3, limit: 20, offset: 0, timestamp: '' } };
    const res = await apiClient.get('/workers', { params: filters });
    return res.data;
  },
  get: async (workerId: string): Promise<APIResponse<Worker>> => {
    if (MOCK_ENABLED) {
      const w = mockWorkers.find(w => w.id === workerId) || mockWorkers[0];
      return { 
        data: { ...w, current_jobs: [], recent_heartbeats: [] },
        meta: { timestamp: '' }
      };
    }
    const res = await apiClient.get(`/workers/${workerId}`);
    return res.data;
  }
};
