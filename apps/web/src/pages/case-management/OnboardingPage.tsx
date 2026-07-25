import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ListChecks } from 'lucide-react';
import { useState } from 'react';
import { CHECKLIST_ITEM_STATUSES, type ChecklistItemStatus } from '@jumpstart/shared';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/input';
import { EmptyState, ErrorState, PageLoader } from '@/components/ui/spinner';
import { api, ApiError, qs, type Paged } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDate, humanize } from '@/lib/utils';
import {
  ParticipantPicker,
  type ChecklistItemRow,
  type ChecklistRow,
  type ParticipantRef,
} from './shared';

function ChecklistItem({
  item,
  canUpdate,
}: {
  item: ChecklistItemRow;
  canUpdate: boolean;
}) {
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState(item.notes ?? '');

  const update = useMutation({
    mutationFn: (body: { status: ChecklistItemStatus; notes?: string }) =>
      api.patch(`/onboarding/items/${item.id}`, body),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['case-management', 'onboarding'] }),
  });

  return (
    <div className="flex flex-col gap-2 border-b py-3 last:border-b-0 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">
          {item.label}
          {item.required ? <span className="ml-1 text-destructive">*</span> : null}
        </p>
        {item.completedAt ? (
          <p className="text-xs text-muted-foreground">Completed {formatDate(item.completedAt)}</p>
        ) : null}
      </div>
      {canUpdate ? (
        <>
          <Input
            className="h-8 sm:w-56"
            placeholder="Notes…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => {
              if (notes !== (item.notes ?? '')) update.mutate({ status: item.status, notes });
            }}
          />
          <Select
            className="h-8 sm:w-40"
            value={item.status}
            disabled={update.isPending}
            onChange={(e) =>
              update.mutate({ status: e.target.value as ChecklistItemStatus, notes })
            }
            aria-label={`Status for ${item.label}`}
          >
            {CHECKLIST_ITEM_STATUSES.map((s) => (
              <option key={s} value={s}>
                {humanize(s)}
              </option>
            ))}
          </Select>
        </>
      ) : (
        <>
          {item.notes ? (
            <span className="text-xs text-muted-foreground sm:w-56">{item.notes}</span>
          ) : null}
          <StatusBadge status={item.status} />
        </>
      )}
      {update.error ? <ErrorState error={update.error} /> : null}
    </div>
  );
}

function ChecklistCard({ checklist }: { checklist: ChecklistRow }) {
  const { can } = useAuth();
  const canUpdate = can('case_management.update');
  const required = checklist.items.filter((i) => i.required);
  const requiredDone = required.filter(
    (i) => i.status === 'completed' || i.status === 'not_applicable',
  ).length;

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div className="space-y-1.5">
          <CardTitle className="flex items-center gap-2">
            {checklist.template?.name ?? 'Onboarding checklist'}
            {checklist.completedAt ? (
              <Badge variant="success">Completed {formatDate(checklist.completedAt)}</Badge>
            ) : (
              <Badge variant="warning">In progress</Badge>
            )}
          </CardTitle>
          <CardDescription>
            Started {formatDate(checklist.startedAt)} · {requiredDone} of {required.length} required
            items done
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {checklist.items.map((item) => (
          <ChecklistItem key={item.id} item={item} canUpdate={canUpdate} />
        ))}
      </CardContent>
    </Card>
  );
}

export function OnboardingPage() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [participant, setParticipant] = useState<ParticipantRef | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['case-management', 'onboarding', participant?.id],
    queryFn: () =>
      api.get<Paged<ChecklistRow>>(
        `/onboarding/checklists${qs({ participantProfileId: participant?.id, pageSize: 10 })}`,
      ),
    enabled: !!participant,
  });

  const instantiate = useMutation({
    mutationFn: () =>
      api.post('/onboarding/checklists', { participantProfileId: participant?.id }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['case-management', 'onboarding'] }),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Onboarding</h2>
        <div className="w-72">
          <ParticipantPicker
            value={participant}
            onChange={setParticipant}
            placeholder="Select a participant…"
          />
        </div>
      </div>

      {!participant ? (
        <EmptyState
          title="Select a participant"
          hint="Search above to view or start their onboarding checklist."
        />
      ) : isLoading ? (
        <PageLoader />
      ) : error ? (
        <ErrorState error={error} />
      ) : !data || data.items.length === 0 ? (
        <div className="space-y-3">
          <EmptyState
            title="No onboarding checklist"
            hint={`${participant.name} has not been started on onboarding yet.`}
          />
          {can('case_management.create') ? (
            <div className="flex flex-col items-center gap-2">
              <Button onClick={() => instantiate.mutate()} disabled={instantiate.isPending}>
                <ListChecks className="h-4 w-4" />
                {instantiate.isPending ? 'Starting…' : 'Start onboarding checklist'}
              </Button>
              {instantiate.error ? (
                <p className="text-sm text-destructive">
                  {instantiate.error instanceof ApiError
                    ? instantiate.error.message
                    : 'Could not start the checklist'}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="space-y-4">
          {data.items.map((checklist) => (
            <ChecklistCard key={checklist.id} checklist={checklist} />
          ))}
        </div>
      )}
    </div>
  );
}
