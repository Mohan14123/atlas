import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { projectsApi } from '../api/projects.api';

export function useProjects(orgId: string | null) {
  return useQuery({
    queryKey: ['projects', orgId],
    queryFn: () => projectsApi.list(orgId!),
    enabled: !!orgId,
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ orgId, name, description }: { orgId: string; name: string; description?: string }) => 
      projectsApi.create(orgId, { name, description }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['projects', variables.orgId] });
    }
  });
}
