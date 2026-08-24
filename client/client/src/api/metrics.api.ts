import { apiClient } from './client';
import { APIResponse, Metrics } from '../types/api.types';

export const metricsApi = {
  getSystemMetrics: async (windowParam: string = '1h'): Promise<APIResponse<Metrics>> => {
    const res = await apiClient.get('/metrics', { params: { window: windowParam } });
    return res.data;
  }
};
