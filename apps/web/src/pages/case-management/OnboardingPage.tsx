import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ListChecks } from 'lucide-react';
import { useState } from 'react';
import { CHECKLIST_ITEM_STATUSES, type ChecklistItemStatus } from '@jumpstart/shared';
import { ChapterFilterSelect } from '@/components/ChapterSelect';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FilterSelect } from '@/components/ui/filter-select';
import { Input } from '@/components/ui/input';
import { FormError } from '@/components/ui/notice';
import { SectionHeader } from '@/components/ui/page-header';
import { EmptyState, ErrorState, PageLoader } from '@/components/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ParticipantPicker, type PickerOption } from '@/components/pickers';
import { api, ApiError, qs, type Paged } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDate, humanize } from '@/lib/utils';
import { type ChecklistItemRow, type ChecklistRow } from './shared';

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
          <FilterSelect
            className="h-8 sm:w-40"
            value={item.status}
            disabled={update.isPending}
            onChange={(value) => update.mutate({ status: value as ChecklistItemStatus, notes })}
            aria-label={`Status for ${item.label}`}
          >
            {CHECKLIST_ITEM_STATUSES.map((s) => (
              <option key={s} value={s}>
                {humanize(s)}
              </option>
            ))}
          </FilterSelect>
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
      <CardHeader>
        <CardTitle>
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
      </CardHeader>
      <CardContent>
        {checklist.items.map((item) => (
          <ChecklistItem key={item.id} item={item} canUpdate={canUpdate} />
        ))}
      </CardContent>
    </Card>
  );
}

/** Every checklist across participants — shown until a participant is chosen. */
function OnboardingOverview({
  state,
  onOpen,
}: {
  state: string;
  onOpen: (participant: PickerOption) => void;
}) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['case-management', 'onboarding', 'overview', state],
    queryFn: () =>
      api.get<Paged<ChecklistRow>>(`/onboarding/checklists${qs({ pageSize: 200, state })}`),
  });

  if (isLoading) return <PageLoader />;
  if (error) return <ErrorState error={error} />;
  if (!data || data.items.length === 0) {
    return (
      <EmptyState
        title="No onboarding checklists yet"
        hint="Search for a participant above to start their checklist."
      />
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>All onboarding checklists</CardTitle>
        <CardDescription>
          {data.total} checklist{data.total === 1 ? '' : 's'} — click a row to open, or search
          above.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Participant</TableHead>
              <TableHead>Checklist</TableHead>
              <TableHead>Started</TableHead>
              <TableHead>Required items</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((checklist) => {
              const name = `${checklist.participantProfile.person.firstName} ${checklist.participantProfile.person.lastName}`;
              const required = checklist.items.filter((i) => i.required);
              const requiredDone = required.filter(
                (i) => i.status === 'completed' || i.status === 'not_applicable',
              ).length;
              return (
                <TableRow
                  key={checklist.id}
                  className="cursor-pointer"
                  onClick={() => onOpen({ id: checklist.participantProfileId, label: name })}
                >
                  <TableCell className="font-medium">
                    {/* Focusable name so the row is reachable by keyboard, not
                        mouse only; stopPropagation keeps the row handler from
                        firing twice. */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpen({ id: checklist.participantProfileId, label: name });
                      }}
                      className="rounded-sm text-left hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {name}
                    </button>
                  </TableCell>
                  <TableCell>{checklist.template?.name ?? 'Onboarding checklist'}</TableCell>
                  <TableCell>{formatDate(checklist.startedAt)}</TableCell>
                  <TableCell>
                    {requiredDone} of {required.length}
                  </TableCell>
                  <TableCell>
                    {checklist.completedAt ? (
                      <Badge variant="success">Completed</Badge>
                    ) : (
                      <Badge variant="warning">In progress</Badge>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export function OnboardingPage() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [participant, setParticipant] = useState<PickerOption | null>(null);
  const [state, setState] = useState('');

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
      <SectionHeader
        title="Onboarding"
        actions={
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            {/* Chapter scoping (§7.2): filters the all-participants overview;
                checklists derive their chapter from the participant. Hidden for
                chapter-scoped users. */}
            <ChapterFilterSelect value={state} onChange={setState} />
            <div className="w-full sm:w-72">
              <ParticipantPicker value={participant} onChange={setParticipant} />
            </div>
          </div>
        }
      />

      {!participant ? (
        <OnboardingOverview state={state} onOpen={setParticipant} />
      ) : isLoading ? (
        <PageLoader />
      ) : error ? (
        <ErrorState error={error} />
      ) : !data || data.items.length === 0 ? (
        <div className="space-y-3">
          <EmptyState
            title="No onboarding checklist"
            hint={`${participant.label} has not been started on onboarding yet.`}
          />
          {can('case_management.create') ? (
            <div className="flex flex-col items-center gap-2">
              <Button onClick={() => instantiate.mutate()} disabled={instantiate.isPending}>
                <ListChecks className="h-4 w-4" />
                {instantiate.isPending ? 'Starting…' : 'Start onboarding checklist'}
              </Button>
              {instantiate.error ? (
                <FormError
                  message={
                    instantiate.error instanceof ApiError
                      ? instantiate.error.message
                      : 'Could not start the checklist'
                  }
                />
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
