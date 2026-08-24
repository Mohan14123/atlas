import { apiClient } from './client';
import { APIResponse, Project } from '../types/api.types';

export const projectsApi = {
  list: async (orgId: string): Promise<APIResponse<{ projects: Project[] }>> => {
    const res = await apiClient.get(`/organizations/${orgId}/projects`);
    return res.data;
  }
};
