import { INTAKE_STATUSES } from '@jumpstart/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChapterFilterSelect } from '@/components/ChapterSelect';
import { DataTable, initialListState, type Column, type ListState } from '@/components/DataTable';
import { ParticipantPicker, type PickerOption } from '@/components/pickers';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DescriptionList, InfoItem } from '@/components/ui/description-list';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input, Label, Select } from '@/components/ui/input';
import { FormError } from '@/components/ui/notice';
import { ErrorState } from '@/components/ui/spinner';
import { ListToolbar, ToolbarSpacer } from '@/components/ui/toolbar';
import { api, qs, type Paged } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDate, humanize } from '@/lib/utils';
import { ReviewControls, SubmittedAge } from './review';
import { apiErrorMessage, type AlumniUpdateItem, type ReviewPayload } from './types';

// Public alumni self-update form on the marketing site (§6.7 tokenized links).
// Integrator: point this at the real form URL if it differs.
const ALUMNI_FORM_BASE = 'https://jumpstartusa.org/alumni-update';

interface IssuedToken {
  id: string;
  token: string;
  expiresAt: string;
}

/**
 * Issue a tokenized self-update link (POST /intake/alumni-form-tokens). The
 * token is a bearer secret shown exactly once — copy it before closing.
 */
function GenerateLinkDialog({ onClose }: { onClose: () => void }) {
  const [participant, setParticipant] = useState<PickerOption | null>(null);
  const [issued, setIssued] = useState<IssuedToken | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (participantProfileId: string) =>
      api.post<IssuedToken>('/intake/alumni-form-tokens', { participantProfileId }),
    onSuccess: (data) => setIssued(data),
    onError: (err) => setError(apiErrorMessage(err)),
  });

  const link = issued ? `${ALUMNI_FORM_BASE}?token=${issued.token}` : null;

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Generate alumni update link</DialogTitle>
          <DialogDescription>
            Creates a single-use link the alumnus can open without logging in.
          </DialogDescription>
        </DialogHeader>

        <FormError message={error} />

        {issued ? (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>One-time link</Label>
              <div className="flex items-center gap-2">
                <Input readOnly value={link ?? ''} className="font-mono text-xs" />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    if (link) {
                      void navigator.clipboard.writeText(link);
                      setCopied(true);
                    }
                  }}
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Expires {formatDate(issued.expiresAt)}. The token is shown only once — copy it
              now; issuing again creates a new link.
            </p>
            <DialogFooter>
              <Button onClick={onClose}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Participant</Label>
              <ParticipantPicker value={participant} onChange={setParticipant} />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button
                disabled={!participant || mutation.isPending}
                onClick={() => {
                  setError(null);
                  if (participant) mutation.mutate(participant.id);
                }}
              >
                {mutation.isPending ? 'Generating…' : 'Generate link'}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function changesSummary(u: AlumniUpdateItem): string[] {
  const changes: string[] = [];
  if (u.employmentStatus) changes.push(`Employment: ${humanize(u.employmentStatus)}`);
  if (u.housingStatus) changes.push(`Housing: ${humanize(u.housingStatus)}`);
  if (u.newPhone) changes.push('New phone');
  if (u.newEmail) changes.push('New email');
  if (u.newAddress) changes.push('New address');
  return changes;
}

function AlumniUpdateDialog({
  item,
  onClose,
}: {
  item: AlumniUpdateItem;
  onClose: () => void;
}) {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: ReviewPayload) =>
      api.post(`/intake/alumni-updates/${item.id}/review`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['intake'] });
      onClose();
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  const person = item.participantProfile.person;

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>
            Alumni update — {person.firstName} {person.lastName}
          </DialogTitle>
          <DialogDescription>
            Submitted {formatDate(item.submittedAt)} ·{' '}
            {item.participantProfile.participantNumber}
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border bg-muted/40 p-3 text-sm">
          <p className="font-medium">On file</p>
          <p className="text-muted-foreground">
            <Link
              to={`/participants/${item.participantProfile.id}`}
              className="text-primary hover:underline"
            >
              {person.firstName} {person.lastName}
            </Link>{' '}
            · {humanize(item.participantProfile.alumniStatus)} ·{' '}
            {[person.primaryPhone, person.primaryEmail].filter(Boolean).join(' · ') ||
              'no contact info'}
          </p>
        </div>

        <DescriptionList>
          <InfoItem label="Employment">
            {item.employmentStatus ? humanize(item.employmentStatus) : '—'}
          </InfoItem>
          <InfoItem label="Housing">
            {item.housingStatus ? humanize(item.housingStatus) : '—'}
          </InfoItem>
          <InfoItem label="New phone">{item.newPhone ?? '—'}</InfoItem>
          <InfoItem label="New email">{item.newEmail ?? '—'}</InfoItem>
          <InfoItem label="New address">{item.newAddress ?? '—'}</InfoItem>
          <InfoItem label="Message" className="sm:col-span-2">
            <span className="whitespace-pre-wrap">{item.message ?? '—'}</span>
          </InfoItem>
        </DescriptionList>

        <ReviewControls
          status={item.status}
          reviewedAt={item.reviewedAt}
          canUpdate={can('intake_queues.update')}
          pending={mutation.isPending}
          error={error}
          approveHint="Approving applies contact changes to the person, logs an alumni engagement, and records the self-reported statuses on the pending outcome check-in wave."
          onAction={(payload) => {
            setError(null);
            mutation.mutate(payload);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

export function AlumniUpdatesTab() {
  const { can } = useAuth();
  const [state, setState] = useState<ListState>({ ...initialListState, sortBy: 'submittedAt' });
  const [status, setStatus] = useState('pending');
  const [stateFilter, setStateFilter] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const query = useQuery({
    queryKey: ['intake', 'alumni-updates', state, status, stateFilter],
    queryFn: () =>
      api.get<Paged<AlumniUpdateItem>>(
        `/intake/alumni-updates${qs({
          page: state.page,
          pageSize: state.pageSize,
          sortBy: state.sortBy,
          sortDir: state.sortDir,
          status: status || undefined,
          state: stateFilter,
        })}`,
      ),
  });

  const selected = query.data?.items.find((i) => i.id === selectedId) ?? null;

  const columns: Column<AlumniUpdateItem>[] = [
    {
      key: 'participant',
      header: 'Participant',
      render: (u) => (
        <span>
          <span className="font-medium">
            {u.participantProfile.person.firstName} {u.participantProfile.person.lastName}
          </span>{' '}
          <span className="text-muted-foreground">
            · {u.participantProfile.participantNumber}
          </span>
        </span>
      ),
    },
    // The alum's CHAPTER (§7.2) — this update derives its chapter from it.
    {
      key: 'chapter',
      header: 'Chapter',
      render: (u) => u.participantProfile.chapterState,
    },
    {
      key: 'changes',
      header: 'Reported',
      render: (u) => {
        const changes = changesSummary(u);
        return changes.length > 0 ? (
          <span className="inline-flex flex-wrap gap-1">
            {changes.map((c) => (
              <Badge key={c} variant="secondary">
                {c}
              </Badge>
            ))}
          </span>
        ) : (
          'Message only'
        );
      },
    },
    {
      key: 'submittedAt',
      header: 'Submitted',
      sortKey: 'submittedAt',
      render: (u) => <SubmittedAge submittedAt={u.submittedAt} status={u.status} />,
    },
    { key: 'status', header: 'Status', sortKey: 'status', render: (u) => <StatusBadge status={u.status} /> },
  ];

  return (
    <div className="space-y-3">
      <ListToolbar>
        <Select
          className="w-full sm:w-44"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setState((s) => ({ ...s, page: 1 }));
          }}
        >
          <option value="">All statuses</option>
          {INTAKE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {humanize(s)}
            </option>
          ))}
        </Select>
        {/* Chapter filter (§7.2) — maps to the alum's chapter server-side;
            hidden for scoped users (the API forces their chapter). */}
        <ChapterFilterSelect
          value={stateFilter}
          onChange={(value) => {
            setStateFilter(value);
            setState((s) => ({ ...s, page: 1 }));
          }}
        />
        <ToolbarSpacer />
        {can('alumni.update') ? (
          <Button variant="outline" onClick={() => setGenerating(true)}>
            Generate update link
          </Button>
        ) : null}
      </ListToolbar>

      {query.isError ? (
        <ErrorState error={query.error} />
      ) : (
        <DataTable
          columns={columns}
          data={query.data}
          isLoading={query.isLoading}
          state={state}
          onStateChange={setState}
          onRowClick={(row) => setSelectedId(row.id)}
          emptyMessage="No alumni updates in this view"
        />
      )}

      {selected ? (
        <AlumniUpdateDialog item={selected} onClose={() => setSelectedId(null)} />
      ) : null}
      {generating ? <GenerateLinkDialog onClose={() => setGenerating(false)} /> : null}
    </div>
  );
}
