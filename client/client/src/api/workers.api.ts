import { apiClient } from './client';
import { APIResponse, PaginatedResponse, Worker } from '../types/api.types';

export const workersApi = {
  list: async (filters: any): Promise<PaginatedResponse<Worker>> => {
    const res = await apiClient.get('/workers', { params: filters });
    return res.data;
  },
  get: async (workerId: string): Promise<APIResponse<Worker>> => {
    const res = await apiClient.get(`/workers/${workerId}`);
    return res.data;
  }
};
