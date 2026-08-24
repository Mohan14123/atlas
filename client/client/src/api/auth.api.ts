import { apiClient } from './client';
import { APIResponse } from '../types/api.types';

const MOCK_ENABLED = import.meta.env.VITE_USE_MOCK === 'true';

export const authApi = {
  login: async (credentials: any): Promise<APIResponse<any>> => {
    if (MOCK_ENABLED) {
      return {
        data: {
          token: 'mock-jwt-token',
          user: { id: 'user-1', email: credentials.email },
        },
        meta: { timestamp: new Date().toISOString() },
      };
    }
    const res = await apiClient.post('/auth/login', credentials);
    return res.data;
  },
};
