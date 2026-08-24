import { apiClient } from './client';
import { APIResponse, PaginatedResponse, Schedule } from '../types/api.types';

export const schedulesApi = {
  list: async (orgId: string, projectId: string, queueId: string): Promise<PaginatedResponse<Schedule>> => {
    const res = await apiClient.get(`/organizations/${orgId}/projects/${projectId}/queues/${queueId}/schedules`);
    return res.data;
  },
  toggle: async (orgId: string, projectId: string, queueId: string, scheduleId: string, enabled: boolean): Promise<APIResponse<Schedule>> => {
    const res = await apiClient.put(`/organizations/${orgId}/projects/${projectId}/queues/${queueId}/schedules/${scheduleId}`, { enabled });
    return res.data;
  },
  delete: async (orgId: string, projectId: string, queueId: string, scheduleId: string): Promise<void> => {
    await apiClient.delete(`/organizations/${orgId}/projects/${projectId}/queues/${queueId}/schedules/${scheduleId}`);
  }
};
