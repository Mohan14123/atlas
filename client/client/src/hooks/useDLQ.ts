import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { dlqApi } from '../api/dlq.api';

export function useDLQ(filters: any) {
  return useQuery({
    queryKey: ['dlq', filters],
    queryFn: () => dlqApi.list(filters),
  });
}

export function useDLQEntry(entryId: string) {
  return useQuery({
    queryKey: ['dlq-entry', entryId],
    queryFn: () => dlqApi.get(entryId),
  });
}

export function useReplayDLQ() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: dlqApi.replay,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dlq'] });
    }
  });
}
