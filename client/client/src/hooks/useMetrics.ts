import { useQuery } from '@tanstack/react-query';
import { metricsApi } from '../api/metrics.api';

export function useMetrics(window: string = '1h') {
  return useQuery({
    queryKey: ['metrics', window],
    queryFn: () => metricsApi.getSystemMetrics(window),
    refetchInterval: 10000,
  });
}
