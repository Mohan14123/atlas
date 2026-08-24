import { apiClient } from './client';
import { APIResponse, PaginatedResponse, Job, JobExecution, JobLog } from '../types/api.types';

const MOCK_ENABLED = import.meta.env.VITE_USE_MOCK === 'true';

const mockJobs: Job[] = [
  { id: 'job-1', queue_id: 'q-1', schedule_id: null, type: 'security-scan', status: 'COMPLETED', priority: 8, payload: { repo: "org/repo" }, attempt_count: 1, max_attempts: 3, worker_id: 'w-1', created_at: new Date().toISOString() },
  { id: 'job-2', queue_id: 'q-1', schedule_id: null, type: 'security-scan', status: 'RUNNING', priority: 8, payload: { repo: "org/repo2" }, attempt_count: 1, max_attempts: 3, worker_id: 'w-2', created_at: new Date().toISOString() },
  { id: 'job-3', queue_id: 'q-1', schedule_id: null, type: 'report', status: 'FAILED', priority: 5, payload: { target: "admin" }, attempt_count: 3, max_attempts: 3, worker_id: 'w-1', created_at: new Date().toISOString() },
];

export const jobsApi = {
  list: async (queueId: string, filters: any): Promise<PaginatedResponse<Job>> => {
    if (MOCK_ENABLED) {
      let filtered = mockJobs.filter(j => j.queue_id === queueId);
      if (filters.status) filtered = filtered.filter(j => j.status === filters.status);
      return { data: filtered, meta: { total: filtered.length, limit: 20, offset: 0, timestamp: new Date().toISOString() } };
    }
    const res = await apiClient.get(`/queues/${queueId}/jobs`, { params: filters });
    return res.data;
  },
  get: async (jobId: string): Promise<APIResponse<Job>> => {
    if (MOCK_ENABLED) {
      return { data: mockJobs.find(j => j.id === jobId) || mockJobs[0], meta: { timestamp: new Date().toISOString() } };
    }
    const res = await apiClient.get(`/jobs/${jobId}`);
    return res.data;
  },
  getExecutions: async (jobId: string): Promise<PaginatedResponse<JobExecution>> => {
    if (MOCK_ENABLED) {
      return {
        data: [
          { id: 'exec-1', job_id: jobId, worker_id: 'w-1', attempt_number: 1, status: 'FAILED', error_message: 'Timeout', started_at: new Date().toISOString(), completed_at: new Date().toISOString(), duration_ms: 30042 },
          { id: 'exec-2', job_id: jobId, worker_id: 'w-1', attempt_number: 2, status: 'COMPLETED', result: { ok: true }, started_at: new Date().toISOString(), completed_at: new Date().toISOString(), duration_ms: 8420 },
        ],
        meta: { total: 2, limit: 20, offset: 0, timestamp: new Date().toISOString() }
      };
    }
    const res = await apiClient.get(`/jobs/${jobId}/executions`);
    return res.data;
  },
  getLogs: async (jobId: string): Promise<PaginatedResponse<JobLog>> => {
    if (MOCK_ENABLED) {
      return {
        data: [
          { id: 'log-1', job_id: jobId, execution_id: 'exec-1', level: 'INFO', message: 'Job claimed', created_at: new Date().toISOString() },
          { id: 'log-2', job_id: jobId, execution_id: 'exec-1', level: 'ERROR', message: 'Timeout waiting for DB', created_at: new Date().toISOString() },
        ],
        meta: { total: 2, limit: 20, offset: 0, timestamp: new Date().toISOString() }
      };
    }
    const res = await apiClient.get(`/jobs/${jobId}/logs`);
    return res.data;
  },
  retry: async (jobId: string): Promise<APIResponse<Job>> => {
    if (MOCK_ENABLED) return { data: mockJobs[0], meta: { timestamp: '' } };
    const res = await apiClient.post(`/jobs/${jobId}/retry`);
    return res.data;
  },
  cancel: async (jobId: string): Promise<APIResponse<Job>> => {
    if (MOCK_ENABLED) return { data: mockJobs[0], meta: { timestamp: '' } };
    const res = await apiClient.post(`/jobs/${jobId}/cancel`);
    return res.data;
  },
};
