import { apiClient } from './client';
import { APIResponse, Organization } from '../types/api.types';

export const organizationsApi = {
  list: async (): Promise<APIResponse<{ organizations: Organization[] }>> => {
    const res = await apiClient.get('/organizations');
    return res.data;
  }
};
