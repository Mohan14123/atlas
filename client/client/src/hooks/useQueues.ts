import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queuesApi } from '../api/queues.api';

export function useQueues(projectId: string) {
  return useQuery({
    queryKey: ['queues', projectId],
    queryFn: () => queuesApi.list(projectId),
  });
}

export function useQueue(queueId: string) {
  return useQuery({
    queryKey: ['queue', queueId],
    queryFn: () => queuesApi.get(queueId),
  });
}

export function useQueueStats(queueId: string) {
  return useQuery({
    queryKey: ['queue-stats', queueId],
    queryFn: () => queuesApi.stats(queueId),
    refetchInterval: 10000,
  });
}

export function usePauseQueue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: queuesApi.pause,
    onSuccess: (_, queueId) => {
      queryClient.invalidateQueries({ queryKey: ['queues'] });
      queryClient.invalidateQueries({ queryKey: ['queue', queueId] });
      queryClient.invalidateQueries({ queryKey: ['queue-stats', queueId] });
    }
  });
}

export function useResumeQueue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: queuesApi.resume,
    onSuccess: (_, queueId) => {
      queryClient.invalidateQueries({ queryKey: ['queues'] });
      queryClient.invalidateQueries({ queryKey: ['queue', queueId] });
      queryClient.invalidateQueries({ queryKey: ['queue-stats', queueId] });
    }
  });
}
