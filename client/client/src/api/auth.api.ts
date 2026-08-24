import { apiClient } from './client';
import { APIResponse } from '../types/api.types';

export const authApi = {
  login: async (credentials: any): Promise<APIResponse<any>> => {
    const res = await apiClient.post('/auth/login', credentials);
    return res.data;
  },
  register: async (credentials: any): Promise<APIResponse<any>> => {
    const res = await apiClient.post('/auth/register', credentials);
    return res.data;
  }
};
