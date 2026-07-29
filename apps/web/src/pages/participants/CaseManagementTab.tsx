import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { StatusBadge } from '@/components/ui/badge';
import { Card, CardContent, CardHeaderRow } from '@/components/ui/card';
import { EmptyState, ErrorState, PageLoader } from '@/components/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { backTo, type BackNavState } from '@/components/BackLink';
import { api, qs, type Paged } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDate } from '@/lib/utils';
import type { ChecklistRow, ServicePlanRow } from './types';

function ManageLink({
  to,
  label,
  state,
}: {
  to: string;
  label: string;
  state?: unknown;
}) {
  return (
    <Link
      to={to}
      state={state}
      className="inline-flex items-center gap-0.5 text-xs font-medium text-primary hover:underline"
    >
      {label} <ArrowUpRight className="h-3 w-3" />
    </Link>
  );
}

function ChecklistCard({ checklist }: { checklist: ChecklistRow }) {
  // not_applicable items don't count against progress.
  const relevant = checklist.items.filter((i) => i.status !== 'not_applicable');
  const done = relevant.filter((i) => i.status === 'completed').length;
  const pct = relevant.length === 0 ? 100 : Math.round((done / relevant.length) * 100);

  return (
    <Card>
      <CardHeaderRow
        title={checklist.template?.name ?? 'Onboarding checklist'}
        description={
          <>
            Started {formatDate(checklist.startedAt)}
            {checklist.completedAt ? ` · Completed ${formatDate(checklist.completedAt)}` : ''}
          </>
        }
      >
        <span className="text-sm font-medium">
          {done}/{relevant.length} · {pct}%
        </span>
      </CardHeaderRow>
      <CardContent className="space-y-3">
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
        </div>
        <ul className="divide-y">
          {checklist.items.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3 py-1.5 text-sm">
              <span className={item.status === 'not_applicable' ? 'text-muted-foreground' : ''}>
                {item.label}
                {item.notes ? (
                  <span className="block text-xs text-muted-foreground">{item.notes}</span>
                ) : null}
              </span>
              <span className="flex shrink-0 items-center gap-2">
                {item.completedAt ? (
                  <span className="text-xs text-muted-foreground">
                    {formatDate(item.completedAt)}
                  </span>
                ) : null}
                <StatusBadge status={item.status} />
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

export function CaseManagementTab({ participantId }: { participantId: string }) {
  const { can } = useAuth();
  const navigate = useNavigate();
  const canRead = can('case_management.read');
  const back: { state: BackNavState } = backTo(
    `/participants/${participantId}?tab=case-management`,
    'Participant record',
  );

  const checklists = useQuery({
    queryKey: ['participants', participantId, 'checklists'],
    queryFn: () =>
      api.get<Paged<ChecklistRow>>(
        `/onboarding/checklists${qs({ participantProfileId: participantId, pageSize: 25 })}`,
      ),
    enabled: canRead,
  });
  const plans = useQuery({
    queryKey: ['participants', participantId, 'service-plans'],
    queryFn: () =>
      api.get<Paged<ServicePlanRow>>(
        `/service-plans${qs({ participantProfileId: participantId, pageSize: 25 })}`,
      ),
    enabled: canRead,
  });

  if (!canRead) {
    return (
      <EmptyState
        title="No access to case management"
        hint="Your role does not include permission to view these records."
      />
    );
  }
  if (checklists.isLoading || plans.isLoading) return <PageLoader />;
  if (checklists.error) return <ErrorState error={checklists.error} />;
  if (plans.error) return <ErrorState error={plans.error} />;

  return (
    <div className="space-y-4">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Onboarding checklists
          </h2>
          <ManageLink to="/case-management/onboarding" label="Manage checklist" state={back.state} />
        </div>
        {!checklists.data || checklists.data.items.length === 0 ? (
          <EmptyState title="No onboarding checklist started" />
        ) : (
          checklists.data.items.map((c) => <ChecklistCard key={c.id} checklist={c} />)
        )}
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Service plans
          </h2>
          <ManageLink to="/case-management/plans" label="Manage plans" state={back.state} />
        </div>
        {!plans.data || plans.data.items.length === 0 ? (
          <EmptyState title="No service plans" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Plan</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Goals</TableHead>
                <TableHead>Review date</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {plans.data.items.map((p) => (
                <TableRow
                  key={p.id}
                  className="cursor-pointer transition-colors hover:bg-muted/60"
                  onClick={() => navigate('/case-management/plans', back)}
                >
                  <TableCell>
                    <div className="font-medium text-primary">{p.title}</div>
                    {p.notes ? (
                      <div className="max-w-md truncate text-xs text-muted-foreground">
                        {p.notes}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={p.status} />
                  </TableCell>
                  <TableCell>{p._count.goals}</TableCell>
                  <TableCell>{formatDate(p.reviewDate)}</TableCell>
                  <TableCell>{formatDate(p.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <p className="text-xs text-muted-foreground">
          Checklist items and plan goals are managed in Case Management — use the links above to
          edit them there.
        </p>
      </div>
    </div>
  );
}
