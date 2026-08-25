import { useQuery } from '@tanstack/react-query';
import { workersApi } from '../api/workers.api';

export function useWorkers(filters: any) {
  return useQuery({
    queryKey: ['workers', filters],
    queryFn: () => workersApi.list(filters),
    refetchInterval: 5000,
  });
}

export function useWorker(workerId: string) {
  return useQuery({
    queryKey: ['worker', workerId],
    queryFn: () => workersApi.get(workerId),
    refetchInterval: 5000
  });
}
