import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { schedulesApi } from '../api/schedules.api';

export function useSchedules(queueId: string) {
  return useQuery({
    queryKey: ['schedules', queueId],
    queryFn: () => schedulesApi.list(queueId),
  });
}

export function useToggleSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ scheduleId, enabled }: { scheduleId: string, enabled: boolean }) => schedulesApi.toggle(scheduleId, enabled),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['schedules'] })
  });
}

export function useDeleteSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: schedulesApi.delete,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['schedules'] })
  });
}
