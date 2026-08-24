import { apiClient } from './client';
import { APIResponse, PaginatedResponse, Schedule } from '../types/api.types';

const MOCK_ENABLED = import.meta.env.VITE_USE_MOCK === 'true';

const mockSchedules: Schedule[] = [
  { id: 'sch-1', queue_id: 'q-1', schedule_type: 'cron', cron_expression: '0 2 * * *', timezone: 'UTC', job_template: { type: 'report', priority: 5, payload: {} }, next_run_at: new Date(Date.now() + 86400000).toISOString(), last_run_at: new Date().toISOString(), enabled: true, created_at: new Date().toISOString() },
  { id: 'sch-2', queue_id: 'q-1', schedule_type: 'once', run_at: new Date(Date.now() + 86400000).toISOString(), timezone: 'UTC', job_template: { type: 'cleanup', priority: 1, payload: {} }, next_run_at: new Date(Date.now() + 86400000).toISOString(), last_run_at: null, enabled: false, created_at: new Date().toISOString() },
];

export const schedulesApi = {
  list: async (queueId: string): Promise<PaginatedResponse<Schedule>> => {
    if (MOCK_ENABLED) return { data: mockSchedules.filter(s => s.queue_id === queueId), meta: { total: 2, limit: 20, offset: 0, timestamp: '' } };
    const res = await apiClient.get(`/queues/${queueId}/schedules`);
    return res.data;
  },
  toggle: async (scheduleId: string, enabled: boolean): Promise<APIResponse<Schedule>> => {
    if (MOCK_ENABLED) return { data: { ...mockSchedules[0], enabled }, meta: { timestamp: '' } };
    const res = await apiClient.patch(`/schedules/${scheduleId}`, { enabled });
    return res.data;
  },
  delete: async (scheduleId: string): Promise<void> => {
    if (MOCK_ENABLED) return;
    await apiClient.delete(`/schedules/${scheduleId}`);
  }
};
