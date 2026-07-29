import { useQuery } from '@tanstack/react-query';
import { api, qs, type Paged } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export interface CaseManagerOption {
  id: string;
  name: string;
}

/**
 * Options for the "assigned case manager" select. There is no general staff
 * lookup endpoint: /admin/users needs admin.users; /caseload-summary
 * (case_management.read) is the fallback but only lists CMs who currently
 * hold a caseload. `extra` merges the currently-assigned CM into the list.
 */
export function useCaseManagerOptions(extra?: CaseManagerOption | null): {
  options: CaseManagerOption[];
  isLoading: boolean;
} {
  const { can } = useAuth();
  const canAdmin = can('admin.users');
  const canCaseload = can('case_management.read');

  const admin = useQuery({
    queryKey: ['participants', 'case-manager-options', 'admin-users'],
    queryFn: () =>
      api.get<Paged<UserRow>>(`/admin/users${qs({ pageSize: 200, status: 'active' })}`),
    enabled: canAdmin,
    staleTime: 5 * 60 * 1000,
  });
  const summary = useQuery({
    queryKey: ['participants', 'case-manager-options', 'caseload-summary'],
    queryFn: () => api.get<CaseloadSummaryRow[]>('/caseload-summary'),
    enabled: !canAdmin && canCaseload,
    staleTime: 5 * 60 * 1000,
  });

  const options: CaseManagerOption[] = canAdmin
    ? (admin.data?.items ?? []).map((u) => ({ id: u.id, name: `${u.firstName} ${u.lastName}` }))
    : (summary.data ?? []).map((r) => ({ id: r.caseManagerId, name: r.caseManagerName }));

  if (extra && !options.some((o) => o.id === extra.id)) options.unshift(extra);

  return { options, isLoading: canAdmin ? admin.isLoading : canCaseload && summary.isLoading };
}

interface UserRow {
  id: string;
  firstName: string;
  lastName: string;
}

interface CaseloadSummaryRow {
  caseManagerId: string;
  caseManagerName: string;
}
