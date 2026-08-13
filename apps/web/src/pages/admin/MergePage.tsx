import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeftRight, GitMerge } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FormField } from '@/components/FormField';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { EntityPicker, type PickerOption } from '@/components/ui/entity-picker';
import { Input } from '@/components/ui/input';
import { Notice } from '@/components/ui/notice';
import { SectionHeader } from '@/components/ui/page-header';
import { EmptyState, ErrorState, NoAccess } from '@/components/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api, qs } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDate, humanize } from '@/lib/utils';

// ── API shapes (admin/person-merge endpoints) ────────────────────────────────

interface MergeSearchHit {
  id: string;
  label: string;
  sublabel?: string;
  profileTypes: string[];
  participantNumber: string | null;
}

type Side = 'winner' | 'loser';

interface ScalarDiff {
  field: string;
  winner: unknown;
  loser: unknown;
}

interface MergePreview {
  winner: { id: string; firstName: string; lastName: string };
  loser: { id: string; firstName: string; lastName: string };
  childCounts: { winner: Record<string, number>; loser: Record<string, number> };
  conflicts: {
    bothHaveUsers: boolean;
    profileConflicts: { participant: boolean; volunteer: boolean };
    blocked: boolean;
    reasons: string[];
  };
  scalarDiffs: ScalarDiff[];
  consentPreview: {
    emailOk: boolean;
    smsOk: boolean;
    mailOnly: boolean;
    doNotContact: boolean;
  };
}

interface MergeSummary {
  winnerPersonId: string;
  loserPersonId: string;
  repointed: Record<string, number>;
  movedProfiles: string[];
  fieldsTakenFromLoser: string[];
  winner: {
    id: string;
    firstName: string;
    lastName: string;
    participantProfileId: string | null;
    participantNumber: string | null;
  };
}

const CHILD_LABELS: Record<string, string> = {
  addresses: 'Address history',
  contacts: 'Emergency contacts',
  testimonyConsents: 'Testimony consents',
  backgroundChecks: 'Background checks',
  communications: 'Communications',
  eventRegistrations: 'Event registrations',
  donors: 'Donor records',
  volunteerApplications: 'Volunteer applications',
};

/** Labels for the server's MERGEABLE_PERSON_FIELDS (field names are camelCase). */
const FIELD_LABELS: Record<string, string> = {
  firstName: 'First name',
  middleName: 'Middle name',
  lastName: 'Last name',
  preferredName: 'Preferred name',
  suffix: 'Suffix',
  dateOfBirth: 'Date of birth',
  gender: 'Gender',
  race: 'Race',
  preferredLanguage: 'Preferred language',
  primaryPhone: 'Primary phone',
  primaryEmail: 'Primary email',
  addressLine1: 'Address line 1',
  addressLine2: 'Address line 2',
  city: 'City',
  state: 'State',
  zip: 'ZIP',
  deceasedAt: 'Deceased date',
};

const PROFILE_LABELS: Record<string, string> = {
  participantProfile: 'Participant profile',
  volunteerProfile: 'Volunteer profile',
  user: 'Login account link',
};

const DATE_FIELDS = new Set(['dateOfBirth', 'deceasedAt']);
const ENUM_FIELDS = new Set(['gender', 'race']);

function renderValue(field: string, value: unknown) {
  if (value === null || value === undefined || value === '') {
    return <span className="text-muted-foreground">—</span>;
  }
  if (DATE_FIELDS.has(field)) return <>{formatDate(String(value))}</>;
  if (ENUM_FIELDS.has(field)) return <>{humanize(String(value))}</>;
  return <>{String(value)}</>;
}

const isEmpty = (v: unknown) => v === null || v === undefined || v === '';

function PersonPicker({
  value,
  onChange,
}: {
  value: PickerOption | null;
  onChange: (option: PickerOption | null) => void;
}) {
  return (
    <EntityPicker
      value={value}
      onChange={onChange}
      queryKey="person-merge-picker"
      placeholder="Search by name, email, or phone…"
      search={async (term) => {
        const hits = await api.get<MergeSearchHit[]>(`/admin/person-merge/search${qs({ q: term })}`);
        return hits.map((h) => ({ id: h.id, label: h.label, sublabel: h.sublabel }));
      }}
    />
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export function MergePage() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [winner, setWinner] = useState<PickerOption | null>(null);
  const [loser, setLoser] = useState<PickerOption | null>(null);
  const [overrides, setOverrides] = useState<Record<string, Side>>({});
  const [confirmText, setConfirmText] = useState('');

  const preview = useMutation({
    mutationFn: (pair: { winnerPersonId: string; loserPersonId: string }) =>
      api.post<MergePreview>('/admin/person-merge/preview', pair),
    onSuccess: (data) => {
      // Default each differing field to the winner, EXCEPT where the winner is
      // blank and the loser has a value — losing data silently helps no one.
      const defaults: Record<string, Side> = {};
      for (const d of data.scalarDiffs) {
        defaults[d.field] = isEmpty(d.winner) && !isEmpty(d.loser) ? 'loser' : 'winner';
      }
      setOverrides(defaults);
      setConfirmText('');
    },
  });

  const execute = useMutation({
    mutationFn: () =>
      api.post<MergeSummary>('/admin/person-merge', {
        winnerPersonId: winner!.id,
        loserPersonId: loser!.id,
        fieldOverrides: overrides,
      }),
    onSuccess: () => queryClient.invalidateQueries(),
  });

  if (!can('person.merge')) {
    return <NoAccess reason="Requires the person.merge permission." />;
  }

  const resetDownstream = () => {
    preview.reset();
    execute.reset();
    setOverrides({});
    setConfirmText('');
  };

  const pick = (side: Side) => (option: PickerOption | null) => {
    if (side === 'winner') setWinner(option);
    else setLoser(option);
    resetDownstream();
  };

  const swap = () => {
    setWinner(loser);
    setLoser(winner);
    resetDownstream();
  };

  const startOver = () => {
    setWinner(null);
    setLoser(null);
    resetDownstream();
  };

  const samePerson = !!winner && !!loser && winner.id === loser.id;
  const data = preview.data;
  const result = execute.data;

  if (result) {
    const moved = Object.entries(result.repointed).filter(([, n]) => n > 0);
    return (
      <div className="space-y-4">
        <SectionHeader title="Merge duplicates" />
        <Card>
          <CardHeader>
            <CardTitle>Merge complete</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Notice variant="success" title={`Merged into ${result.winner.firstName} ${result.winner.lastName}`}>
              The duplicate record was soft-deleted and every linked record now points at the
              kept person.
            </Notice>
            <div className="text-sm">
              <p className="font-medium">Records moved</p>
              {moved.length === 0 && result.movedProfiles.length === 0 ? (
                <p className="text-muted-foreground">
                  The duplicate had no linked records to move.
                </p>
              ) : (
                <ul className="mt-1 list-disc pl-5 text-muted-foreground">
                  {result.movedProfiles.map((p) => (
                    <li key={p}>{PROFILE_LABELS[p] ?? humanize(p)}</li>
                  ))}
                  {moved.map(([key, n]) => (
                    <li key={key}>
                      {CHILD_LABELS[key] ?? humanize(key)}: {n}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {result.winner.participantProfileId ? (
                <Button onClick={() => navigate(`/participants/${result.winner.participantProfileId}`)}>
                  View participant profile
                  {result.winner.participantNumber ? ` (${result.winner.participantNumber})` : ''}
                </Button>
              ) : null}
              <Button variant="outline" onClick={startOver}>
                Start another merge
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SectionHeader title="Merge duplicates" />

      <Card>
        <CardHeader>
          <CardTitle>People</CardTitle>
          <CardDescription>
            The kept person keeps its record; every linked record on the duplicate moves over,
            consent flags merge conservatively, and the duplicate is soft-deleted. Merging is
            audited and cannot be undone from this screen.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Keep (winner)" required>
              <PersonPicker value={winner} onChange={pick('winner')} />
            </FormField>
            <FormField label="Merge away (duplicate)" required>
              <PersonPicker value={loser} onChange={pick('loser')} />
            </FormField>
          </div>
          {samePerson ? (
            <Notice variant="warning">Pick two different people to merge.</Notice>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={!winner || !loser || samePerson || preview.isPending}
              onClick={() =>
                preview.mutate({ winnerPersonId: winner!.id, loserPersonId: loser!.id })
              }
            >
              {preview.isPending ? 'Previewing…' : 'Preview merge'}
            </Button>
            <Button variant="outline" disabled={!winner && !loser} onClick={swap}>
              <ArrowLeftRight className="h-4 w-4" /> Swap
            </Button>
          </div>
          {preview.error ? <ErrorState error={preview.error} /> : null}
        </CardContent>
      </Card>

      {data ? (
        data.conflicts.blocked ? (
          <Notice variant="error" title="These records cannot be merged">
            <ul>
              {data.conflicts.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </Notice>
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Differing details</CardTitle>
                <CardDescription>
                  Pick which value to keep for each field that differs. Everything else keeps the
                  winner&apos;s value.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {data.scalarDiffs.length === 0 ? (
                  <Notice variant="info">
                    No conflicting fields — the kept person&apos;s details stay as they are.
                  </Notice>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Field</TableHead>
                        <TableHead>
                          Keep — {data.winner.firstName} {data.winner.lastName}
                        </TableHead>
                        <TableHead>
                          Duplicate — {data.loser.firstName} {data.loser.lastName}
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.scalarDiffs.map((d) => (
                        <TableRow key={d.field}>
                          <TableCell className="font-medium">
                            {FIELD_LABELS[d.field] ?? humanize(d.field)}
                          </TableCell>
                          {(['winner', 'loser'] as const).map((side) => (
                            <TableCell key={side}>
                              <label className="flex cursor-pointer items-start gap-2">
                                <input
                                  type="radio"
                                  name={`field-${d.field}`}
                                  className="mt-1 h-3.5 w-3.5 accent-primary"
                                  checked={(overrides[d.field] ?? 'winner') === side}
                                  onChange={() =>
                                    setOverrides((o) => ({ ...o, [d.field]: side }))
                                  }
                                />
                                <span>{renderValue(d.field, d[side])}</span>
                              </label>
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Linked records</CardTitle>
                <CardDescription>
                  Every row in the duplicate&apos;s column moves to the kept person.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Records</TableHead>
                      <TableHead className="text-right">Keep</TableHead>
                      <TableHead className="text-right">Duplicate (moves)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.keys(CHILD_LABELS).map((key) => (
                      <TableRow key={key}>
                        <TableCell>{CHILD_LABELS[key]}</TableCell>
                        <TableCell className="text-right">
                          {data.childCounts.winner[key] ?? 0}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {data.childCounts.loser[key] ?? 0}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <Notice variant="info" title="Consent after merging (conservative)">
                  Do-not-contact and mail-only win when either record has them; email opt-out
                  wins; SMS stays opted in only when backed by a recorded consent timestamp.
                  Result: email {data.consentPreview.emailOk ? 'OK' : 'no'}, SMS{' '}
                  {data.consentPreview.smsOk ? 'OK' : 'no'}, mail-only{' '}
                  {data.consentPreview.mailOnly ? 'yes' : 'no'}, do-not-contact{' '}
                  {data.consentPreview.doNotContact ? 'yes' : 'no'}.
                </Notice>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Confirm merge</CardTitle>
                <CardDescription>
                  This re-points every linked record, soft-deletes the duplicate, and writes one
                  audit entry. It cannot be undone from this screen.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField label="Type MERGE to confirm" required>
                  <Input
                    className="sm:max-w-xs"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    placeholder="MERGE"
                  />
                </FormField>
                {execute.error ? <ErrorState error={execute.error} /> : null}
                <Button
                  variant="destructive"
                  disabled={confirmText !== 'MERGE' || execute.isPending}
                  onClick={() => execute.mutate()}
                >
                  <GitMerge className="h-4 w-4" />
                  {execute.isPending ? 'Merging…' : 'Merge people'}
                </Button>
              </CardContent>
            </Card>
          </>
        )
      ) : null}
    </div>
  );
}
