import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { jobsApi } from '../api/jobs.api';

export function useJobs(queueId: string, filters: any) {
  return useQuery({
    queryKey: ['jobs', queueId, filters],
    queryFn: () => jobsApi.list(queueId, filters),
  });
}

export function useJob(jobId: string) {
  return useQuery({
    queryKey: ['job', jobId],
    queryFn: () => jobsApi.get(jobId),
  });
}

export function useJobExecutions(jobId: string) {
  return useQuery({
    queryKey: ['job-executions', jobId],
    queryFn: () => jobsApi.getExecutions(jobId),
  });
}

export function useJobLogs(jobId: string) {
  return useQuery({
    queryKey: ['job-logs', jobId],
    queryFn: () => jobsApi.getLogs(jobId),
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
