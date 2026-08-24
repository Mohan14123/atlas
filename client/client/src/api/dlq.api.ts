import { apiClient } from './client';
import { APIResponse, PaginatedResponse, DLQEntry } from '../types/api.types';

const MOCK_ENABLED = import.meta.env.VITE_USE_MOCK === 'true';

const mockDlq: DLQEntry[] = [
  {
    id: 'dlq-1', job_id: 'job-99', reason: 'MAX_ATTEMPTS_EXCEEDED', attempts: 3, error_message: 'Connection refused after 3 retries', failed_at: new Date().toISOString(),
    ai_summary: 'The target API server is unreachable, likely due to a firewall issue or service outage.',
    job: { id: 'job-99', queue_id: 'q-1', schedule_id: null, type: 'webhook', status: 'FAILED', priority: 5, payload: { url: "https://example.com" }, attempt_count: 3, max_attempts: 3, created_at: new Date().toISOString() }
  }
];

export const dlqApi = {
  list: async (filters: any): Promise<PaginatedResponse<DLQEntry>> => {
    if (MOCK_ENABLED) return { data: mockDlq, meta: { total: 1, limit: 20, offset: 0, timestamp: new Date().toISOString() } };
    const res = await apiClient.get(`/dlq`, { params: filters });
    return res.data;
  },
  get: async (entryId: string): Promise<APIResponse<DLQEntry>> => {
    if (MOCK_ENABLED) return { data: mockDlq.find(e => e.id === entryId) || mockDlq[0], meta: { timestamp: '' } };
    const res = await apiClient.get(`/dlq/${entryId}`);
    return res.data;
  },
  replay: async (entryId: string): Promise<APIResponse<any>> => {
    if (MOCK_ENABLED) return { data: { new_job: { id: 'job-100', status: 'QUEUED' } }, meta: { timestamp: '' } };
    const res = await apiClient.post(`/dlq/${entryId}/replay`);
    return res.data;
  }
};
