import { useQuery } from '@tanstack/react-query';
import { projectsApi } from '../api/projects.api';

export function useProjects(orgId: string | null) {
  return useQuery({
    queryKey: ['projects', orgId],
    queryFn: () => projectsApi.list(orgId!),
    enabled: !!orgId,
  });
}
