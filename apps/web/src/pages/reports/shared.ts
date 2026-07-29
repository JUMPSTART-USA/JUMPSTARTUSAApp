import { useQuery } from '@tanstack/react-query';
import { api, qs, type Paged } from '@/lib/api';
import { useAuth } from '@/lib/auth';

// ── Report registry types (mirror of reports.service.ts shapes) ──────────────

export interface ReportParamDef {
  name: string;
  label: string;
  type: 'uuid' | 'date' | 'enum' | 'number';
  required?: boolean;
  values?: readonly string[];
}

export interface ReportSummary {
  key: string;
  name: string;
  params: ReportParamDef[];
}

export interface ReportColumn {
  key: string;
  label: string;
}

export type ReportCell = string | number | boolean | null;

export interface ReportResult {
  columns: ReportColumn[];
  rows: Record<string, ReportCell>[];
}

/** GET /reports — the API already filters to reports the user may run. */
export function useReportCatalog() {
  return useQuery({
    queryKey: ['reports', 'catalog'],
    queryFn: () => api.get<ReportSummary[]>('/reports'),
    staleTime: 5 * 60 * 1000,
  });
}

// ── Entity option sources for uuid report params ─────────────────────────────

export interface EntityOption {
  id: string;
  label: string;
}

function useListOptions<T>(
  key: string,
  path: string,
  enabled: boolean,
  map: (item: T) => EntityOption,
): { options: EntityOption[]; isLoading: boolean } {
  const query = useQuery({
    queryKey: ['reports', 'options', key],
    queryFn: () => api.get<Paged<T>>(path),
    enabled,
    staleTime: 5 * 60 * 1000,
  });
  return { options: (query.data?.items ?? []).map(map), isLoading: query.isLoading };
}

export function useInstitutionOptions(enabled: boolean) {
  return useListOptions<{ id: string; name: string; state: string }>(
    'institutions',
    `/institutions${qs({ pageSize: 200 })}`,
    enabled,
    (i) => ({ id: i.id, label: `${i.name} (${i.state})` }),
  );
}

export function useInsideClassOptions(enabled: boolean) {
  return useListOptions<{ id: string; name: string; institution: { name: string } }>(
    'inside-classes',
    `/inside-classes${qs({ pageSize: 200 })}`,
    enabled,
    (c) => ({ id: c.id, label: `${c.name} — ${c.institution.name}` }),
  );
}

export function useVehicleOptions(enabled: boolean) {
  return useListOptions<{
    id: string;
    year: number;
    make: string;
    model: string;
    licensePlate: string | null;
  }>('vehicles', `/vehicles${qs({ pageSize: 200 })}`, enabled, (v) => ({
    id: v.id,
    label: `${v.year} ${v.make} ${v.model}${v.licensePlate ? ` (${v.licensePlate})` : ''}`,
  }));
}

export function useCampaignOptions(enabled: boolean) {
  return useListOptions<{ id: string; name: string }>(
    'campaigns',
    `/campaigns${qs({ pageSize: 200 })}`,
    enabled,
    (c) => ({ id: c.id, label: c.name }),
  );
}

export function useEmployerOptions(enabled: boolean) {
  return useListOptions<{ id: string; name: string }>(
    'employers',
    `/employers${qs({ pageSize: 200 })}`,
    enabled,
    (e) => ({ id: e.id, label: e.name }),
  );
}

/**
 * Staff options for caseManagerId. There is no general staff lookup endpoint:
 * /admin/users needs admin.users; /caseload-summary (case_management.read) is
 * the fallback but only lists managers who currently hold a caseload.
 */
export function useCaseManagerOptions(enabled: boolean): {
  options: EntityOption[];
  isLoading: boolean;
} {
  const { can } = useAuth();
  const viaAdmin = can('admin.users');
  const viaCaseload = can('case_management.read');

  const admin = useQuery({
    queryKey: ['reports', 'options', 'case-managers', 'admin-users'],
    queryFn: () =>
      api.get<Paged<{ id: string; firstName: string; lastName: string }>>(
        `/admin/users${qs({ pageSize: 200, status: 'active' })}`,
      ),
    enabled: enabled && viaAdmin,
    staleTime: 5 * 60 * 1000,
  });
  const summary = useQuery({
    queryKey: ['reports', 'options', 'case-managers', 'caseload-summary'],
    queryFn: () =>
      api.get<{ caseManagerId: string; caseManagerName: string }[]>('/caseload-summary'),
    enabled: enabled && !viaAdmin && viaCaseload,
    staleTime: 5 * 60 * 1000,
  });

  const options: EntityOption[] = viaAdmin
    ? (admin.data?.items ?? []).map((u) => ({ id: u.id, label: `${u.firstName} ${u.lastName}` }))
    : (summary.data ?? []).map((r) => ({ id: r.caseManagerId, label: r.caseManagerName }));
  return { options, isLoading: viaAdmin ? admin.isLoading : summary.isLoading };
}

export function useParticipantOptions(search: string, enabled: boolean) {
  const query = useQuery({
    queryKey: ['reports', 'options', 'participants', search],
    queryFn: () =>
      api.get<
        Paged<{
          id: string;
          participantNumber: string;
          person: { firstName: string; lastName: string };
        }>
      >(`/participants${qs({ search, pageSize: 20 })}`),
    enabled,
    staleTime: 60 * 1000,
  });
  return {
    options: (query.data?.items ?? []).map((p) => ({
      id: p.id,
      label: `#${p.participantNumber} — ${p.person.firstName} ${p.person.lastName}`,
    })),
    isLoading: query.isLoading,
  };
}
