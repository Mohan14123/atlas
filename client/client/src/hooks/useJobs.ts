import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { jobsApi } from '../api/jobs.api';
import { useAppContext } from '../components/layout/AppContext';

export function useJobs(queueId: string, filters: any) {
  const { orgId, projectId } = useAppContext();
  return useQuery({
    queryKey: ['jobs', orgId, projectId, queueId, filters],
    queryFn: () => jobsApi.list(orgId!, projectId!, queueId, filters),
    enabled: !!orgId && !!projectId && !!queueId,
  });
}

export function useJob(jobId: string) {
  return useQuery({
    queryKey: ['job', jobId],
    queryFn: () => jobsApi.get(jobId),
    enabled: !!jobId,
  });
}

export function useJobExecutions(jobId: string) {
  return useQuery({
    queryKey: ['job-executions', jobId],
    queryFn: () => jobsApi.getExecutions(jobId),
    enabled: !!jobId,
  });
}

export function useJobLogs(jobId: string) {
  return useQuery({
    queryKey: ['job-logs', jobId],
    queryFn: () => jobsApi.getLogs(jobId),
    enabled: !!jobId,
  });
}

export function useRetryJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: jobsApi.retry,
    onSuccess: (_, jobId) => {
      queryClient.invalidateQueries({ queryKey: ['job', jobId] });
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
    }
  });
}

export function useCancelJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: jobsApi.cancel,
    onSuccess: (_, jobId) => {
      queryClient.invalidateQueries({ queryKey: ['job', jobId] });
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
    }
  });
}
