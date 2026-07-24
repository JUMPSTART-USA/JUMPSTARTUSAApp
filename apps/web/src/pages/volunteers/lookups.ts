import { useQuery } from '@tanstack/react-query';
import { api, qs, type Paged } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { NamedRef } from './types';

/**
 * Reference lists for assignment / requirement Selects. Each is gated on the
 * viewer holding that module's read permission — otherwise the query would
 * just 403 and the Select stays empty.
 */

const LOOKUP_STALE = 5 * 60 * 1000;

export function useInstitutionsLookup() {
  const { can } = useAuth();
  const query = useQuery({
    queryKey: ['volunteers', 'lookup', 'institutions'],
    queryFn: () =>
      api.get<Paged<NamedRef & { state?: string }>>(
        `/institutions${qs({ pageSize: 200, active: true, sortBy: 'name' })}`,
      ),
    enabled: can('institutions.read'),
    staleTime: LOOKUP_STALE,
  });
  return { items: query.data?.items ?? [], allowed: can('institutions.read') };
}

export function useInsideClassesLookup(institutionId?: string) {
  const { can } = useAuth();
  const query = useQuery({
    queryKey: ['volunteers', 'lookup', 'inside-classes', institutionId ?? 'all'],
    queryFn: () =>
      api.get<Paged<NamedRef & { institutionId?: string }>>(
        `/inside-classes${qs({ pageSize: 200, institutionId })}`,
      ),
    enabled: can('inside_classes.read'),
    staleTime: LOOKUP_STALE,
  });
  return { items: query.data?.items ?? [], allowed: can('inside_classes.read') };
}

export function useOutsideProgramsLookup() {
  const { can } = useAuth();
  const query = useQuery({
    queryKey: ['volunteers', 'lookup', 'outside-programs'],
    queryFn: () => api.get<Paged<NamedRef>>(`/outside-programs${qs({ pageSize: 200 })}`),
    enabled: can('outside_programs.read'),
    staleTime: LOOKUP_STALE,
  });
  return { items: query.data?.items ?? [], allowed: can('outside_programs.read') };
}

export function useEventsLookup() {
  const { can } = useAuth();
  const query = useQuery({
    queryKey: ['volunteers', 'lookup', 'events'],
    queryFn: () =>
      api.get<Paged<NamedRef & { eventDate?: string }>>(`/events${qs({ pageSize: 200 })}`),
    enabled: can('events.read'),
    staleTime: LOOKUP_STALE,
  });
  return { items: query.data?.items ?? [], allowed: can('events.read') };
}
