import { useQuery } from '@tanstack/react-query';
import { api, qs, type Paged } from '@/lib/api';
import type { InstitutionOption } from './types';

/** Institution options for filter/form selects (name-sorted, first 200). */
export function useInstitutionOptions() {
  return useQuery({
    queryKey: ['inside-classes', 'institution-options'],
    queryFn: () =>
      api.get<Paged<InstitutionOption>>(`/institutions${qs({ pageSize: 200, sortBy: 'name' })}`),
    staleTime: 5 * 60 * 1000,
  });
}
