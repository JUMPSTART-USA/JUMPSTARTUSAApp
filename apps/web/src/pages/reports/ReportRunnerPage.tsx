import { useQuery } from '@tanstack/react-query';
import { Download, Play } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { FormField } from '@/components/FormField';
import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { FilterSelect } from '@/components/ui/filter-select';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
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
import { useDebounced } from '@/lib/form';
import { BackLink } from '@/components/BackLink';
import { cn, formatDate, formatMoney, humanize } from '@/lib/utils';
import {
  useCampaignOptions,
  useCaseManagerOptions,
  useEmployerOptions,
  useInsideClassOptions,
  useInstitutionOptions,
  useOpportunityOptions,
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
  'paid',
  'balance',
  'totalGiven',
  'totalAmount',
  'totalDeductible',
  'largestGift',
]);
const PERCENT_KEYS = new Set(['occupancyPct', 'pctOfGoal']);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const SNAKE_ENUM = /^[a-z0-9]+(_[a-z0-9]+)*$/;

/**
 * Whether a column holds magnitudes, and so should be right-aligned and tabular.
 *
 * Reports are the most number-dense tables in the app and the only ones with no
 * alignment treatment at all — because their columns are data-driven, so nobody
 * could hand-annotate them. The test is the same one `renderCell` already makes
 * below: it is the ROW that knows, not a column definition.
 *
 * A boolean renders "Yes"/"No" and a status renders a badge, so `typeof number`
 * is the whole rule.
 */
function isNumericColumn(colKey: string, rows: Record<string, ReportCell>[]) {
  const firstPresent = rows.find((row) => row[colKey] !== null && row[colKey] !== undefined && row[colKey] !== '');
  return typeof firstPresent?.[colKey] === 'number';
}

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
  const { data: catalog, isLoading, error } = useReportCatalog();

  if (isLoading) return <PageLoader />;
  if (error) return <ErrorState error={error} />;

  const report = catalog?.find((r) => r.key === key);
  if (!report) {
    return (
      <div className="space-y-4">
        <BackLink fallbackTo="/reports" fallbackLabel="Reports" />
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
  const { can } = useAuth();

  // A required numeric 'year' param (giving-statements) defaults to the current year.
  const [values, setValues] = useState<Record<string, string>>(
    (): Record<string, string> =>
      report.params.some((p) => p.name === 'year' && p.type === 'number' && p.required)
        ? { year: String(new Date().getFullYear()) }
        : {},
  );
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
  const opportunities = useOpportunityOptions(has('opportunityId'));

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
  // Built from the submitted snapshot, not live form state, so exports always
  // match the displayed run even if params were edited since.
  const exportUrl = (format: 'csv' | 'xlsx' | 'pdf') =>
    `/api/reports/${report.key}/export${qs({ ...(submitted ?? {}), format })}`;

  const uuidOptions: Record<string, { options: EntityOption[]; isLoading: boolean }> = {
    institutionId: institutions,
    insideClassId: insideClasses,
    vehicleId: vehicles,
    campaignId: campaigns,
    employerId: employers,
    caseManagerId: caseManagers,
    opportunityId: opportunities,
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
        <FilterSelect
          aria-label={param.label}
          value={value}
          onChange={(v) => setValue(param.name, v)}
        >
          <option value="">All</option>
          {param.values.map((v) => (
            <option key={v} value={v}>
              {v.length <= 2 ? v : humanize(v)}
            </option>
          ))}
        </FilterSelect>
      );
    }
    if (param.type === 'uuid') {
      if (param.name === 'participantProfileId') {
        return <ParticipantPicker value={value} onChange={(v) => setValue(param.name, v)} />;
      }
      const source = uuidOptions[param.name];
      if (source) {
        return (
          <FilterSelect
            aria-label={param.label}
            value={value}
            onChange={(v) => setValue(param.name, v)}
          >
            <option value="">{source.isLoading ? 'Loading…' : `All`}</option>
            {source.options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </FilterSelect>
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
      <div>
        <BackLink fallbackTo="/reports" fallbackLabel="Reports" />
        <PageHeader
          className="mt-1"
          title={report.name}
          actions={
            can('reports.export') ? (
              <>
                <Button
                  variant="outline"
                  disabled={submitted === null}
                  onClick={() => window.open(exportUrl('csv'))}
                >
                  <Download className="h-4 w-4" /> Export CSV
                </Button>
                <Button
                  variant="outline"
                  disabled={submitted === null}
                  onClick={() => window.open(exportUrl('xlsx'))}
                >
                  <Download className="h-4 w-4" /> Export Excel
                </Button>
                <Button
                  variant="outline"
                  disabled={submitted === null}
                  onClick={() => window.open(exportUrl('pdf'))}
                >
                  <Download className="h-4 w-4" /> Export PDF
                </Button>
              </>
            ) : undefined
          }
        />
      </div>

      {report.params.length > 0 ? (
        <Card>
          <CardContent className="p-5">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {report.params.map((param) => (
                <FormField key={param.name} label={param.label} required={param.required}>
                  {renderControl(param)}
                </FormField>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button
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
          </CardContent>
        </Card>
      ) : null}

      {runQuery.error ? <ErrorState error={runQuery.error} onRetry={runQuery.refetch} /> : null}
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
                      <TableHead
                        key={col.key}
                        className={cn(
                          'sticky top-0 z-10 bg-card',
                          isNumericColumn(col.key, result.rows) && 'text-right',
                        )}
                      >
                        {col.label}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.rows.map((row, i) => (
                    <TableRow key={i}>
                      {result.columns.map((col) => (
                        <TableCell
                          key={col.key}
                          className={cn(
                            'whitespace-nowrap',
                            isNumericColumn(col.key, result.rows) && 'text-right tabular-nums',
                          )}
                        >
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
      <FilterSelect aria-label="Participant" value={value} onChange={onChange}>
        <option value="">{isLoading ? 'Searching…' : 'All participants'}</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </FilterSelect>
    </div>
  );
}
