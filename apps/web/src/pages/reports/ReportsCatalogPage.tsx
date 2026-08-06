import { ChevronRight, FileBarChart } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeaderRow } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState, ErrorState, PageLoader } from '@/components/ui/spinner';
import { useReportCatalog, type ReportSummary } from './shared';

/** Display grouping for the 21 registry reports; unknown keys land in Other. */
const GROUPS: { name: string; keys: string[] }[] = [
  {
    name: 'Programs',
    keys: [
      'participant-status',
      'inside-class-roster',
      'inside-class-completions',
      'institution-activity',
      'outside-program-enrollment',
    ],
  },
  { name: 'Housing', keys: ['housing-occupancy', 'housing-exits'] },
  { name: 'Case Management', keys: ['case-activity'] },
  { name: 'Volunteers', keys: ['volunteer-assignments', 'volunteer-trainings', 'volunteer-hours'] },
  {
    name: 'Development',
    keys: [
      'donor-giving',
      'campaign-performance',
      'event-financials',
      'pledge-status',
      'recurring-gifts',
      'giving-statements',
    ],
  },
  { name: 'Employment', keys: ['employer-participation', 'employment-history'] },
  { name: 'Fleet', keys: ['vehicle-maintenance', 'upcoming-maintenance'] },
];

function groupReports(reports: ReportSummary[]): { name: string; reports: ReportSummary[] }[] {
  const byKey = new Map(reports.map((r) => [r.key, r]));
  const grouped = GROUPS.map((g) => ({
    name: g.name,
    reports: g.keys.map((k) => byKey.get(k)).filter((r): r is ReportSummary => r !== undefined),
  }));
  const known = new Set(GROUPS.flatMap((g) => g.keys));
  const other = reports.filter((r) => !known.has(r.key));
  if (other.length > 0) grouped.push({ name: 'Other', reports: other });
  return grouped.filter((g) => g.reports.length > 0);
}

function paramSummary(report: ReportSummary): string {
  if (report.params.length === 0) return 'No parameters';
  return report.params.map((p) => p.label + (p.required ? ' (required)' : '')).join(' · ');
}

export function ReportsCatalogPage() {
  const navigate = useNavigate();
  const { data, isLoading, error } = useReportCatalog();

  if (isLoading) return <PageLoader />;
  if (error) return <ErrorState error={error} />;

  const reports = data ?? [];
  const groups = groupReports(reports);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Reports"
        description={`${reports.length} report${reports.length === 1 ? '' : 's'} available`}
      />

      {reports.length === 0 ? (
        <EmptyState
          title="No reports available"
          hint="Reports are filtered to your permissions — ask an administrator if one is missing."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {groups.map((group) => (
            <Card key={group.name}>
              <CardHeaderRow
                title={
                  <>
                    <FileBarChart className="h-4 w-4 text-muted-foreground" />
                    {group.name}
                  </>
                }
              >
                <Badge variant="secondary">{group.reports.length}</Badge>
              </CardHeaderRow>
              <CardContent>
                <ul className="divide-y">
                  {group.reports.map((report) => (
                    <li key={report.key} className="-mx-2">
                      <button
                        type="button"
                        className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-2.5 text-left transition-colors hover:bg-accent"
                        onClick={() => navigate(`/reports/${report.key}`)}
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-medium">{report.name}</div>
                          <div className="truncate text-xs text-muted-foreground">
                            {paramSummary(report)}
                          </div>
                        </div>
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      </button>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
