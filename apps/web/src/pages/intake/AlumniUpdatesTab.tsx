import { INTAKE_STATUSES } from '@jumpstart/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { DataTable, initialListState, type Column, type ListState } from '@/components/DataTable';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input, Label, Select } from '@/components/ui/input';
import { ErrorState } from '@/components/ui/spinner';
import { api, qs, type Paged } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDate, humanize } from '@/lib/utils';
import { ReviewControls, Row, SubmittedAge } from './review';
import { apiErrorMessage, type AlumniUpdateItem, type ReviewPayload } from './types';

// Public alumni self-update form on the marketing site (§6.7 tokenized links).
// Integrator: point this at the real form URL if it differs.
const ALUMNI_FORM_BASE = 'https://jumpstartusa.org/alumni-update';

interface ParticipantHit {
  id: string;
  participantNumber: string;
  person: { firstName: string; lastName: string };
}

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
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [participant, setParticipant] = useState<{ id: string; label: string } | null>(null);
  const [issued, setIssued] = useState<IssuedToken | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setSearch(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const results = useQuery({
    queryKey: ['intake', 'participant-picker', search],
    queryFn: () =>
      api.get<Paged<ParticipantHit>>(`/participants${qs({ search, pageSize: 8 })}`),
    enabled: !participant && !issued && search.trim().length >= 2,
  });

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

        {error ? <ErrorState error={new Error(error)} /> : null}

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
            {participant ? (
              <div className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-1.5 text-sm">
                <span>{participant.label}</span>
                <Button variant="ghost" size="sm" onClick={() => setParticipant(null)}>
                  Change
                </Button>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label>Participant</Label>
                <Input
                  placeholder="Search participants by name or number…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
                {search.trim().length >= 2 ? (
                  <div className="max-h-44 divide-y overflow-y-auto rounded-md border bg-card">
                    {results.isFetching ? (
                      <div className="px-3 py-2 text-sm text-muted-foreground">Searching…</div>
                    ) : !results.data || results.data.items.length === 0 ? (
                      <div className="px-3 py-2 text-sm text-muted-foreground">No matches</div>
                    ) : (
                      results.data.items.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          className="block w-full px-3 py-2 text-left text-sm hover:bg-accent"
                          onClick={() =>
                            setParticipant({
                              id: p.id,
                              label: `${p.person.firstName} ${p.person.lastName} · ${p.participantNumber}`,
                            })
                          }
                        >
                          {p.person.firstName} {p.person.lastName}{' '}
                          <span className="text-muted-foreground">
                            · {p.participantNumber}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                ) : null}
              </div>
            )}
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
      <DialogContent className="max-w-xl">
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

        <div className="divide-y">
          <Row label="Employment">
            {item.employmentStatus ? humanize(item.employmentStatus) : '—'}
          </Row>
          <Row label="Housing">{item.housingStatus ? humanize(item.housingStatus) : '—'}</Row>
          <Row label="New phone">{item.newPhone ?? '—'}</Row>
          <Row label="New email">{item.newEmail ?? '—'}</Row>
          <Row label="New address">{item.newAddress ?? '—'}</Row>
          <Row label="Message">
            <span className="whitespace-pre-wrap">{item.message ?? '—'}</span>
          </Row>
        </div>

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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const query = useQuery({
    queryKey: ['intake', 'alumni-updates', state, status],
    queryFn: () =>
      api.get<Paged<AlumniUpdateItem>>(
        `/intake/alumni-updates${qs({
          page: state.page,
          pageSize: state.pageSize,
          sortBy: state.sortBy,
          sortDir: state.sortDir,
          status: status || undefined,
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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Select
          className="w-40"
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
        {can('alumni.update') ? (
          <Button variant="outline" onClick={() => setGenerating(true)}>
            Generate update link
          </Button>
        ) : null}
      </div>

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
