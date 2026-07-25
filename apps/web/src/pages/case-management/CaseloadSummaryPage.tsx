import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EmptyState, ErrorState, PageLoader } from '@/components/ui/spinner';
import { api } from '@/lib/api';
import type { CaseloadSummaryRow } from './shared';

/** Supervisor caseload dashboard — activity counts only, no note content (§7.3). */
export function CaseloadSummaryPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['case-management', 'caseload-summary'],
    queryFn: () => api.get<CaseloadSummaryRow[]>('/caseload-summary'),
  });

  if (isLoading) return <PageLoader />;
  if (error) return <ErrorState error={error} />;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Caseload Summary</CardTitle>
        <CardDescription>
          Activity by case manager — participant counts and recent-contact metrics.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!data || data.length === 0 ? (
          <EmptyState
            title="No caseloads"
            hint="No participants are currently assigned to a case manager."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Case manager</TableHead>
                <TableHead className="text-right">Active participants</TableHead>
                <TableHead className="text-right">Notes (7 days)</TableHead>
                <TableHead className="text-right">Overdue follow-ups</TableHead>
                <TableHead className="text-right">No contact 30+ days</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((row) => (
                <TableRow key={row.caseManagerId}>
                  <TableCell className="font-medium">{row.caseManagerName}</TableCell>
                  <TableCell className="text-right">{row.activeParticipants}</TableCell>
                  <TableCell className="text-right">{row.notesLast7Days}</TableCell>
                  <TableCell className="text-right">
                    {row.overdueFollowUps > 0 ? (
                      <Badge variant="destructive">{row.overdueFollowUps}</Badge>
                    ) : (
                      0
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {row.participantsNoContact30Days > 0 ? (
                      <Badge variant="warning">{row.participantsNoContact30Days}</Badge>
                    ) : (
                      0
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
