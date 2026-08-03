import { useQuery } from '@tanstack/react-query';
import { api, qs, type Paged } from './api';
import { useAuth } from './auth';

/**
 * Pending participant portal requests (messages / meetings / transportation),
 * shared by the Requests tab badges and the sidebar nav badge. One lightweight
 * aggregate: three pageSize=1 fetches whose totals are all we keep. Lives
 * under the ['case-management'] key so every request-dialog action's
 * invalidation refreshes it too.
 */
export function usePortalRequestsPending() {
  const { can } = useAuth();
  return useQuery({
    queryKey: ['case-management', 'portal-requests', 'pending-counts'],
    queryFn: async () => {
      const [messages, meetings, transport] = await Promise.all([
        api.get<Paged<unknown>>(`/portal-messages${qs({ status: 'new', pageSize: 1 })}`),
        api.get<Paged<unknown>>(`/meeting-requests${qs({ status: 'pending', pageSize: 1 })}`),
        api.get<Paged<unknown>>(`/transport-requests${qs({ status: 'pending', pageSize: 1 })}`),
      ]);
      return {
        messages: messages.total,
        meetings: meetings.total,
        transport: transport.total,
        total: messages.total + meetings.total + transport.total,
      };
    },
    enabled: can('case_management.read'),
    staleTime: 60 * 1000,
  });
}
