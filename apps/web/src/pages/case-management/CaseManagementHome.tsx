import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CalendarClock, CheckCircle2, Sun } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SectionHeader } from '@/components/ui/page-header';
import { EmptyState, ErrorState, PageLoader } from '@/components/ui/spinner';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDate, humanize } from '@/lib/utils';
import type { FollowUpItem, FollowUpQueue } from './shared';
import { BackLink } from '@/components/BackLink';

function FollowUpRow({
  item,
  canComplete,
  onComplete,
  completing,
}: {
  item: FollowUpItem;
  canComplete: boolean;
  onComplete: (item: FollowUpItem) => void;
  completing: boolean;
}) {
  return (
    <li className="flex items-center gap-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{item.title}</p>
        <p className="text-xs text-muted-foreground">
          {item.participantProfileId && item.participantName ? (
            <Link
              to={`/participants/${item.participantProfileId}`}
              className="text-primary hover:underline"
            >
              {item.participantName}
            </Link>
          ) : (
            'No participant'
          )}
          {item.dueDate ? <> · due {formatDate(item.dueDate)}</> : <> · no due date</>}
        </p>
      </div>
      {item.kind === 'task' ? (
        <StatusBadge status={item.status} />
      ) : (
        <Badge variant="outline">{humanize(item.category)}</Badge>
      )}
      {canComplete ? (
        <Button size="sm" variant="outline" disabled={completing} onClick={() => onComplete(item)}>
          <CheckCircle2 className="h-3.5 w-3.5" /> Done
        </Button>
      ) : null}
    </li>
  );
}

function QueueSection({
  title,
  icon,
  items,
  emptyText,
  accent,
  canComplete,
  onComplete,
  completingId,
}: {
  title: string;
  icon: React.ReactNode;
  items: FollowUpItem[];
  emptyText: string;
  accent?: string;
  canComplete: boolean;
  onComplete: (item: FollowUpItem) => void;
  completingId: string | null;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className={accent}>
          {icon}
          {title}
          <span className="ml-auto text-sm font-normal text-muted-foreground">{items.length}</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">{emptyText}</p>
        ) : (
          <ul className="divide-y">
            {items.map((item) => (
              <FollowUpRow
                key={`${item.kind}:${item.id}`}
                item={item}
                canComplete={canComplete}
                onComplete={onComplete}
                completing={completingId === item.id}
              />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/** The case manager's home screen: my follow-up queue (§6.5). */
export function CaseManagementHome() {
  const { user, can } = useAuth();
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['case-management', 'follow-ups'],
    queryFn: () => api.get<FollowUpQueue>('/follow-ups'),
  });

  const complete = useMutation({
    mutationFn: (item: FollowUpItem) =>
      item.kind === 'task'
        ? api.post(`/case-tasks/${item.id}/complete`)
        : api.post(`/case-notes/${item.id}/complete-follow-up`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['case-management'] }),
  });

  if (isLoading) return <PageLoader />;
  if (error) return <ErrorState error={error} />;
  if (!data) return null;

  const total = data.overdue.length + data.today.length + data.upcoming.length;
  const canComplete = can('case_management.update');
  const completingId = complete.isPending ? (complete.variables?.id ?? null) : null;

  return (
    <div className="space-y-4">
      <BackLink stateOnly />
      <SectionHeader
        title={user ? `${user.firstName}'s follow-up queue` : 'My follow-up queue'}
        description="Open tasks and case-note follow-ups assigned to you."
      />
      {complete.error ? <ErrorState error={complete.error} /> : null}
      {total === 0 ? (
        <EmptyState
          title="All caught up"
          hint="No open tasks or pending note follow-ups. New ones appear here as they are created."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <QueueSection
            title="Overdue"
            icon={<AlertTriangle className="h-4 w-4 text-destructive" />}
            accent="text-destructive"
            items={data.overdue}
            emptyText="Nothing overdue."
            canComplete={canComplete}
            onComplete={(item) => complete.mutate(item)}
            completingId={completingId}
          />
          <QueueSection
            title="Today"
            icon={<Sun className="h-4 w-4 text-warning" />}
            items={data.today}
            emptyText="Nothing due today."
            canComplete={canComplete}
            onComplete={(item) => complete.mutate(item)}
            completingId={completingId}
          />
          <QueueSection
            title="Upcoming"
            icon={<CalendarClock className="h-4 w-4 text-muted-foreground" />}
            items={data.upcoming}
            emptyText="Nothing scheduled."
            canComplete={canComplete}
            onComplete={(item) => complete.mutate(item)}
            completingId={completingId}
          />
        </div>
      )}
    </div>
  );
}
