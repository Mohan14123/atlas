import { apiClient } from './client';
import { APIResponse, PaginatedResponse, DLQEntry, Job } from '../types/api.types';

export const dlqApi = {
  list: async (filters: any): Promise<PaginatedResponse<DLQEntry>> => {
    const res = await apiClient.get('/dlq', { params: filters });
    return res.data;
  },
  get: async (entryId: string): Promise<APIResponse<DLQEntry>> => {
    const res = await apiClient.get(`/dlq/${entryId}`);
    return res.data;
  },
  replay: async (entryId: string): Promise<APIResponse<{ new_job: Job }>> => {
    const res = await apiClient.post(`/dlq/${entryId}/replay`);
    return res.data;
  }
};
