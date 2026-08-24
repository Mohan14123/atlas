import { useQuery } from '@tanstack/react-query';
import { organizationsApi } from '../api/organizations.api';

export function useOrganizations() {
  return useQuery({
    queryKey: ['organizations'],
    queryFn: () => organizationsApi.list(),
  });
}
