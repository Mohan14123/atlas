import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { schedulesApi } from '../api/schedules.api';
import { useAppContext } from '../components/layout/AppContext';

export function useSchedules(queueId: string) {
  const { orgId, projectId } = useAppContext();
  return useQuery({
    queryKey: ['schedules', orgId, projectId, queueId],
    queryFn: () => schedulesApi.list(orgId!, projectId!, queueId),
    enabled: !!orgId && !!projectId && !!queueId,
  });
}

export function useToggleSchedule(queueId: string) {
  const queryClient = useQueryClient();
  const { orgId, projectId } = useAppContext();
  return useMutation({
    mutationFn: ({ scheduleId, enabled }: { scheduleId: string, enabled: boolean }) => schedulesApi.toggle(orgId!, projectId!, queueId, scheduleId, enabled),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['schedules'] })
  });
}

export function useDeleteSchedule(queueId: string) {
  const queryClient = useQueryClient();
  const { orgId, projectId } = useAppContext();
  return useMutation({
    mutationFn: (scheduleId: string) => schedulesApi.delete(orgId!, projectId!, queueId, scheduleId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['schedules'] })
  });
}
