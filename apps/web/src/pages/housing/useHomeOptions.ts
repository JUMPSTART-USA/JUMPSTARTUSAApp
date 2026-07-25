import { useQuery } from '@tanstack/react-query';
import { api, qs, type Paged } from '@/lib/api';
import type { HomeRow } from './types';

/** All homes (active first via name sort), for move-in / transfer destination selects. */
export function useHomeOptions(enabled: boolean) {
  return useQuery({
    queryKey: ['housing', 'home-options'],
    queryFn: () => api.get<Paged<HomeRow>>(`/transitional-homes${qs({ pageSize: 200 })}`),
    enabled,
    staleTime: 60 * 1000,
    select: (data) =>
      [...data.items].sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name)),
  });
}

export function homeOptionLabel(h: HomeRow): string {
  const occupancy = `${h.occupied}/${h.capacity}`;
  return `${h.name} (${h.state}) — ${occupancy}${h.active ? '' : ' · inactive'}`;
}
