import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Download, Play } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FormField } from '@/components/FormField';
import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EmptyState, ErrorState, PageLoader, Spinner } from '@/components/ui/spinner';
import { api, qs } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDate, formatMoney, humanize } from '@/lib/utils';
import {
  useCampaignOptions,
  useCaseManagerOptions,
  useDebounced,
  useEmployerOptions,
  useInsideClassOptions,
  useInstitutionOptions,
  useParticipantOptions,
  useReportCatalog,
  useVehicleOptions,
  type EntityOption,
  type ReportCell,
  type ReportParamDef,
  type ReportResult,
  type ReportSummary,
} from './shared';

/** Report columns holding dollar values — everything else renders raw. */
const MONEY_KEYS = new Set([
  'amount',
  'cost',
  'revenue',
  'expenses',
  'net',
  'goalAmount',
  'raisedToDate',
  'linkedDonations',
  'payRate',
]);
const PERCENT_KEYS = new Set(['occupancyPct', 'pctOfGoal']);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const SNAKE_ENUM = /^[a-z0-9]+(_[a-z0-9]+)*$/;

function renderCell(colKey: string, value: ReportCell) {
  if (value === null || value === undefined || value === '') {
    return <span className="text-muted-foreground">—</span>;
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') {
    if (MONEY_KEYS.has(colKey)) return formatMoney(value);
    if (PERCENT_KEYS.has(colKey)) return `${value}%`;
    return value.toLocaleString('en-US');
  }
  if (ISO_DATE.test(value)) return formatDate(value);
  if (colKey.toLowerCase().includes('status') && SNAKE_ENUM.test(value)) {
    return <StatusBadge status={value} />;
  }
  if (colKey === 'finalAssessment' && SNAKE_ENUM.test(value)) return <StatusBadge status={value} />;
  return value;
}

export function ReportRunnerPage() {
  const { key } = useParams<{ key: string }>();
  const navigate = useNavigate();
  const { data: catalog, isLoading, error } = useReportCatalog();

  if (isLoading) return <PageLoader />;
  if (error) return <ErrorState error={error} />;

  const report = catalog?.find((r) => r.key === key);
  if (!report) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/reports')}>
          <ArrowLeft className="h-4 w-4" /> Back to reports
        </Button>
        <EmptyState
          title="Report not found"
          hint="It may not exist, or your account may not hold the permission it requires."
        />
      </div>
    );
  }

  // Keyed remount resets param state when navigating between reports.
  return <RunnerInner key={report.key} report={report} />;
}

function RunnerInner({ report }: { report: ReportSummary }) {
  const navigate = useNavigate();
  const { can } = useAuth();

  const [values, setValues] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState<Record<string, string> | null>(null);
  // Bumped on every Run so identical params still refetch fresh data.
  const [runId, setRunId] = useState(0);

  const has = (name: string) => report.params.some((p) => p.name === name);
  const institutions = useInstitutionOptions(has('institutionId'));
  const insideClasses = useInsideClassOptions(has('insideClassId'));
  const vehicles = useVehicleOptions(has('vehicleId'));
  const campaigns = useCampaignOptions(has('campaignId'));
  const employers = useEmployerOptions(has('employerId'));
  const caseManagers = useCaseManagerOptions(has('caseManagerId'));

  // Zero-param reports run immediately — there is nothing to fill in.
  useEffect(() => {
    if (report.params.length === 0) setSubmitted({});
  }, [report.params.length]);

  const runQuery = useQuery({
    queryKey: ['reports', 'run', report.key, submitted, runId],
    queryFn: () => api.get<ReportResult>(`/reports/${report.key}${qs(submitted ?? {})}`),
    enabled: submitted !== null,
  });

  const setValue = (name: string, value: string) =>
    setValues((prev) => ({ ...prev, [name]: value }));

  const missingRequired = report.params.filter((p) => p.required && !values[p.name]);
  const cleanParams = () => {
    const out: Record<string, string> = {};
    for (const p of report.params) {
      const v = values[p.name];
      if (v) out[p.name] = v;
    }
    return out;
  };

  // Plain <GET> download — session cookie auth means no token plumbing needed.
  const exportUrl = (format: 'csv' | 'xlsx') =>
    `/api/reports/${report.key}/export${qs({ ...cleanParams(), format })}`;

  const uuidOptions: Record<string, { options: EntityOption[]; isLoading: boolean }> = {
    institutionId: institutions,
    insideClassId: insideClasses,
    vehicleId: vehicles,
    campaignId: campaigns,
    employerId: employers,
    caseManagerId: caseManagers,
  };

  const renderControl = (param: ReportParamDef) => {
    const value = values[param.name] ?? '';
    if (param.type === 'date') {
      return (
        <Input type="date" value={value} onChange={(e) => setValue(param.name, e.target.value)} />
      );
    }
    if (param.type === 'number') {
      return (
        <Input
          type="number"
          min={1}
          value={value}
          onChange={(e) => setValue(param.name, e.target.value)}
        />
      );
    }
    if (param.type === 'enum' && param.values) {
      return (
        <Select value={value} onChange={(e) => setValue(param.name, e.target.value)}>
          <option value="">All</option>
          {param.values.map((v) => (
            <option key={v} value={v}>
              {v.length <= 2 ? v : humanize(v)}
            </option>
          ))}
        </Select>
      );
    }
    if (param.type === 'uuid') {
      if (param.name === 'participantProfileId') {
        return <ParticipantPicker value={value} onChange={(v) => setValue(param.name, v)} />;
      }
      const source = uuidOptions[param.name];
      if (source) {
        return (
          <Select value={value} onChange={(e) => setValue(param.name, e.target.value)}>
            <option value="">{source.isLoading ? 'Loading…' : `All`}</option>
            {source.options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </Select>
        );
      }
    }
    return (
      <Input
        value={value}
        placeholder="UUID"
        onChange={(e) => setValue(param.name, e.target.value)}
      />
    );
  };

  const result = runQuery.data;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate('/reports')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-xl font-semibold">{report.name}</h1>
        </div>
        {can('reports.export') ? (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={missingRequired.length > 0}
              onClick={() => window.open(exportUrl('csv'))}
            >
              <Download className="h-4 w-4" /> Export CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={missingRequired.length > 0}
              onClick={() => window.open(exportUrl('xlsx'))}
            >
              <Download className="h-4 w-4" /> Export Excel
            </Button>
          </div>
        ) : null}
      </div>

      {report.params.length > 0 ? (
        <div className="rounded-lg border bg-card p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {report.params.map((param) => (
              <FormField key={param.name} label={param.label} required={param.required}>
                {renderControl(param)}
              </FormField>
            ))}
          </div>
          <div className="mt-4 flex items-center gap-3">
            <Button
              size="sm"
              disabled={missingRequired.length > 0 || runQuery.isFetching}
              onClick={() => {
                setSubmitted(cleanParams());
                setRunId((n) => n + 1);
              }}
            >
              <Play className="h-4 w-4" /> {runQuery.isFetching ? 'Running…' : 'Run report'}
            </Button>
            {missingRequired.length > 0 ? (
              <span className="text-sm text-muted-foreground">
                Select {missingRequired.map((p) => p.label).join(', ')} to run
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      {runQuery.error ? <ErrorState error={runQuery.error} /> : null}
      {runQuery.isFetching && !result ? <PageLoader /> : null}

      {result ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {runQuery.isFetching ? <Spinner className="h-4 w-4" /> : null}
            <span>
              {result.rows.length} row{result.rows.length === 1 ? '' : 's'}
            </span>
          </div>
          {result.rows.length === 0 ? (
            <EmptyState title="No data" hint="No rows matched the selected parameters." />
          ) : (
            <div className="max-h-[70vh] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {result.columns.map((col) => (
                      <TableHead key={col.key} className="sticky top-0 z-10 bg-card">
                        {col.label}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.rows.map((row, i) => (
                    <TableRow key={i}>
                      {result.columns.map((col) => (
                        <TableCell key={col.key} className="whitespace-nowrap">
                          {renderCell(col.key, row[col.key] ?? null)}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      ) : submitted === null && report.params.length > 0 ? (
        <EmptyState
          title="Set parameters and run"
          hint="Results appear here; exports honor the same parameters."
        />
      ) : null}
    </div>
  );
}

function ParticipantPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search);
  const { options, isLoading } = useParticipantOptions(debounced, true);

  return (
    <div className="space-y-1.5">
      <Input
        placeholder="Search name or number…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <Select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{isLoading ? 'Searching…' : 'All participants'}</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </Select>
    </div>
  );
}
