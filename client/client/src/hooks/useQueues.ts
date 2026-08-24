import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queuesApi } from '../api/queues.api';
import { useAppContext } from '../components/layout/AppContext';

export function useQueues() {
  const { orgId, projectId } = useAppContext();
  return useQuery({
    queryKey: ['queues', orgId, projectId],
    queryFn: () => queuesApi.list(orgId!, projectId!),
    enabled: !!orgId && !!projectId,
  });
}

export function useCreateQueue() {
  const queryClient = useQueryClient();
  const { orgId, projectId } = useAppContext();
  return useMutation({
    mutationFn: (data: { name: string; concurrency_limit: number; priority?: number; retry_policy?: { strategy: string; max_attempts: number } }) => 
      queuesApi.create(orgId!, projectId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['queues', orgId, projectId] });
    }
  });
}

export function useQueue(queueId: string) {
  const { orgId, projectId } = useAppContext();
  return useQuery({
    queryKey: ['queue', orgId, projectId, queueId],
    queryFn: () => queuesApi.get(orgId!, projectId!, queueId),
    enabled: !!orgId && !!projectId && !!queueId,
  });
}

export function useQueueStats(queueId: string) {
  const { orgId, projectId } = useAppContext();
  return useQuery({
    queryKey: ['queue-stats', orgId, projectId, queueId],
    queryFn: () => queuesApi.stats(orgId!, projectId!, queueId),
    refetchInterval: 10000,
    enabled: !!orgId && !!projectId && !!queueId,
  });
}

export function usePauseQueue() {
  const queryClient = useQueryClient();
  const { orgId, projectId } = useAppContext();
  return useMutation({
    mutationFn: (queueId: string) => queuesApi.pause(orgId!, projectId!, queueId),
    onSuccess: (_, queueId) => {
      queryClient.invalidateQueries({ queryKey: ['queues'] });
      queryClient.invalidateQueries({ queryKey: ['queue', orgId, projectId, queueId] });
      queryClient.invalidateQueries({ queryKey: ['queue-stats', orgId, projectId, queueId] });
    }
  });
}

export function useResumeQueue() {
  const queryClient = useQueryClient();
  const { orgId, projectId } = useAppContext();
  return useMutation({
    mutationFn: (queueId: string) => queuesApi.resume(orgId!, projectId!, queueId),
    onSuccess: (_, queueId) => {
      queryClient.invalidateQueries({ queryKey: ['queues'] });
      queryClient.invalidateQueries({ queryKey: ['queue', orgId, projectId, queueId] });
      queryClient.invalidateQueries({ queryKey: ['queue-stats', orgId, projectId, queueId] });
    }
  });
}
