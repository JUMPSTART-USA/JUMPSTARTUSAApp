import { INSIDE_CLASS_TYPE_LABELS } from '@jumpstart/shared';
import { useQuery } from '@tanstack/react-query';
import { api, qs, type Paged } from '@/lib/api';
import { humanize } from '@/lib/utils';
import type { InstitutionOption } from './types';

/** Display label for a stored classType — enum label, humanized fallback for legacy values, em dash for none. */
export function classTypeLabel(value: string | null | undefined): string {
  if (!value) return '—';
  return (INSIDE_CLASS_TYPE_LABELS as Record<string, string>)[value] ?? humanize(value);
}

/** Institution options for filter/form selects (name-sorted, first 200). */
export function useInstitutionOptions() {
  return useQuery({
    queryKey: ['inside-classes', 'institution-options'],
    queryFn: () =>
      api.get<Paged<InstitutionOption>>(`/institutions${qs({ pageSize: 200, sortBy: 'name' })}`),
    staleTime: 5 * 60 * 1000,
  });
}
