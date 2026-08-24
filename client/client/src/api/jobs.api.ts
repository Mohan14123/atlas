import { apiClient } from './client';
import { APIResponse, PaginatedResponse, Job, JobExecution, JobLog } from '../types/api.types';

export const jobsApi = {
  list: async (orgId: string, projectId: string, queueId: string, filters: any): Promise<PaginatedResponse<Job>> => {
    const res = await apiClient.get(`/organizations/${orgId}/projects/${projectId}/queues/${queueId}/jobs`, { params: filters });
    return res.data;
  },
  get: async (jobId: string): Promise<APIResponse<Job>> => {
    const res = await apiClient.get(`/jobs/${jobId}`);
    return res.data;
  },
  getExecutions: async (jobId: string): Promise<PaginatedResponse<JobExecution>> => {
    const res = await apiClient.get(`/jobs/${jobId}/executions`);
    return res.data;
  },
  getLogs: async (jobId: string): Promise<PaginatedResponse<JobLog>> => {
    const res = await apiClient.get(`/jobs/${jobId}/logs`);
    return res.data;
  },
  retry: async (jobId: string): Promise<APIResponse<Job>> => {
    const res = await apiClient.post(`/jobs/${jobId}/retry`);
    return res.data;
  },
  cancel: async (jobId: string): Promise<APIResponse<Job>> => {
    const res = await apiClient.post(`/jobs/${jobId}/cancel`);
    return res.data;
  },
};
