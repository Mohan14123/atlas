import { apiClient } from './client';
import { APIResponse, PaginatedResponse, Queue, QueueStats } from '../types/api.types';

export const queuesApi = {
  list: async (orgId: string, projectId: string): Promise<APIResponse<{ queues: Queue[] }>> => {
    const res = await apiClient.get(`/organizations/${orgId}/projects/${projectId}/queues`);
    return res.data;
  },
  create: async (orgId: string, projectId: string, data: { name: string; concurrency_limit: number; priority?: number; retry_policy?: { strategy: string; max_attempts: number } }): Promise<APIResponse<{ queue: Queue }>> => {
    const res = await apiClient.post(`/organizations/${orgId}/projects/${projectId}/queues`, data);
    return res.data;
  },
  get: async (orgId: string, projectId: string, queueId: string): Promise<APIResponse<Queue>> => {
    const res = await apiClient.get(`/organizations/${orgId}/projects/${projectId}/queues/${queueId}`);
    return res.data;
  },
  pause: async (orgId: string, projectId: string, queueId: string): Promise<APIResponse<any>> => {
    const res = await apiClient.put(`/organizations/${orgId}/projects/${projectId}/queues/${queueId}/pause`);
    return res.data;
  },
  resume: async (orgId: string, projectId: string, queueId: string): Promise<APIResponse<any>> => {
    const res = await apiClient.put(`/organizations/${orgId}/projects/${projectId}/queues/${queueId}/resume`);
    return res.data;
  },
  stats: async (orgId: string, projectId: string, queueId: string): Promise<APIResponse<QueueStats>> => {
    const res = await apiClient.get(`/organizations/${orgId}/projects/${projectId}/queues/${queueId}/stats`);
    return res.data;
  }
};
