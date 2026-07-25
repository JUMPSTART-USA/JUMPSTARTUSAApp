import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDate, humanize } from '@/lib/utils';
import { DetailRow } from './shared';
import {
  AddressDialog,
  ConsentDialog,
  ContactDialog,
  DocIdDialog,
} from './subresource-dialogs';
import type {
  DocIdRow,
  ParticipantDetail,
  PersonAddressRow,
  PersonContactRow,
  StatusHistoryRow,
  TestimonyConsentRow,
} from './types';

const dash = <span className="text-muted-foreground">—</span>;

function orDash(value: string | null | undefined) {
  return value ? value : dash;
}

type DialogState =
  | { kind: 'contact'; row: PersonContactRow | null }
  | { kind: 'address'; row: PersonAddressRow | null }
  | { kind: 'docId'; row: DocIdRow | null }
  | { kind: 'consent'; row: TestimonyConsentRow | null }
  | null;

export function OverviewTab({ participant }: { participant: ParticipantDetail }) {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const canEdit = can('participants.update');
  const [dialog, setDialog] = useState<DialogState>(null);
  const person = participant.person;

  const historyQuery = useQuery({
    queryKey: ['participants', participant.id, 'status-history'],
    queryFn: () => api.get<StatusHistoryRow[]>(`/participants/${participant.id}/status-history`),
  });

  const deleteContact = useMutation({
    mutationFn: (contactId: string) =>
      api.delete(`/participants/${participant.id}/contacts/${contactId}`),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ['participants', participant.id] }),
  });

  const addButton = (label: string, onClick: () => void) =>
    canEdit ? (
      <Button variant="outline" size="sm" onClick={onClick}>
        <Plus className="h-3.5 w-3.5" /> {label}
      </Button>
    ) : null;

  const editButton = (onClick: () => void) =>
    canEdit ? (
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClick}>
        <Pencil className="h-3.5 w-3.5" />
        <span className="sr-only">Edit</span>
      </Button>
    ) : null;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Person</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="divide-y">
            <DetailRow label="Date of birth">{formatDate(person.dateOfBirth)}</DetailRow>
            <DetailRow label="Gender">{humanize(person.gender)}</DetailRow>
            <DetailRow label="Preferred language">{orDash(person.preferredLanguage)}</DetailRow>
            <DetailRow label="Phone">{orDash(person.primaryPhone)}</DetailRow>
            <DetailRow label="Email">{orDash(person.primaryEmail)}</DetailRow>
            <DetailRow label="Mailing address">
              {person.addressLine1 ? (
                <span>
                  {person.addressLine1}
                  {person.addressLine2 ? <>, {person.addressLine2}</> : null}
                  <br />
                  {[person.city, person.state].filter(Boolean).join(', ')} {person.zip}
                </span>
              ) : (
                dash
              )}
            </DetailRow>
            <DetailRow label="Contact preferences">
              <span className="inline-flex flex-wrap justify-end gap-1">
                {person.doNotContact ? <Badge variant="destructive">Do not contact</Badge> : null}
                {person.mailOnly ? <Badge variant="warning">Mail only</Badge> : null}
                {person.emailOk ? <Badge variant="outline">Email OK</Badge> : null}
                {person.smsOk ? (
                  <Badge variant="outline">
                    SMS OK{person.smsConsentAt ? ` (since ${formatDate(person.smsConsentAt)})` : ''}
                  </Badge>
                ) : null}
              </span>
            </DetailRow>
            {person.deceasedAt ? (
              <DetailRow label="Deceased">{formatDate(person.deceasedAt)}</DetailRow>
            ) : null}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Program profile</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="divide-y">
            <DetailRow label="Inside status">
              <StatusBadge status={participant.insideStatus} />
            </DetailRow>
            <DetailRow label="Outside status">
              <StatusBadge status={participant.outsideStatus} />
            </DetailRow>
            <DetailRow label="Phase">{orDash(participant.phase)}</DetailRow>
            <DetailRow label="Alumni status">
              <StatusBadge status={participant.alumniStatus} />
            </DetailRow>
            <DetailRow label="Intake date">{formatDate(participant.intakeDate)}</DetailRow>
            <DetailRow label="Release date">{formatDate(participant.releaseDate)}</DetailRow>
            <DetailRow label="Graduation date">{formatDate(participant.graduationDate)}</DetailRow>
            <DetailRow label="Case manager">
              {participant.assignedCaseManager
                ? `${participant.assignedCaseManager.firstName} ${participant.assignedCaseManager.lastName}`
                : dash}
            </DetailRow>
            {participant.notes ? (
              <DetailRow label="Notes">
                <span className="whitespace-pre-wrap text-left">{participant.notes}</span>
              </DetailRow>
            ) : null}
          </dl>

          {historyQuery.data && historyQuery.data.length > 0 ? (
            <div className="mt-4 border-t pt-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Status history
              </p>
              <ul className="space-y-1.5 text-sm">
                {historyQuery.data.slice(0, 8).map((h) => (
                  <li key={h.id} className="flex items-baseline justify-between gap-3">
                    <span>
                      <span className="text-muted-foreground">{humanize(h.domain)}:</span>{' '}
                      {h.fromValue ? humanize(h.fromValue) : 'none'} → {humanize(h.toValue)}
                      {h.reason ? (
                        <span className="text-muted-foreground"> — {h.reason}</span>
                      ) : null}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatDate(h.effectiveDate)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Contacts</CardTitle>
          {addButton('Add contact', () => setDialog({ kind: 'contact', row: null }))}
        </CardHeader>
        <CardContent>
          {person.contacts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No contacts recorded.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Relationship</TableHead>
                  <TableHead>Phone / email</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {person.contacts.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <div className="font-medium">{c.name}</div>
                      <div className="flex gap-1">
                        {c.isEmergency ? <Badge variant="destructive">Emergency</Badge> : null}
                        {c.isMinor ? <Badge variant="warning">Minor</Badge> : null}
                      </div>
                      {c.isMinor && c.guardianName ? (
                        <div className="text-xs text-muted-foreground">
                          Guardian: {c.guardianName}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell>{c.relationship}</TableCell>
                    <TableCell>
                      <div>{orDash(c.phone)}</div>
                      {c.email ? (
                        <div className="text-xs text-muted-foreground">{c.email}</div>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right">
                      {editButton(() => setDialog({ kind: 'contact', row: c }))}
                      {canEdit ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive"
                          disabled={deleteContact.isPending}
                          onClick={() => {
                            if (window.confirm(`Remove contact "${c.name}"?`)) {
                              deleteContact.mutate(c.id);
                            }
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span className="sr-only">Delete</span>
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Address history</CardTitle>
          {addButton('Add address', () => setDialog({ kind: 'address', row: null }))}
        </CardHeader>
        <CardContent>
          {person.addresses.length === 0 ? (
            <p className="text-sm text-muted-foreground">No addresses recorded.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Address</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Valid</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {person.addresses.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>
                      <div className="font-medium">
                        {a.addressLine1}
                        {a.addressLine2 ? `, ${a.addressLine2}` : ''}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {a.city}, {a.state} {a.zip}
                      </div>
                      <div className="flex gap-1">
                        {a.isCurrent ? <Badge variant="success">Current</Badge> : null}
                        {a.returnedMailAt ? (
                          <Badge variant="warning">
                            Returned mail {formatDate(a.returnedMailAt)}
                          </Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>{orDash(a.addressType)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {a.validFrom || a.validTo
                        ? `${formatDate(a.validFrom)} – ${formatDate(a.validTo)}`
                        : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      {editButton(() => setDialog({ kind: 'address', row: a }))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">DOC IDs</CardTitle>
          {addButton('Add DOC ID', () => setDialog({ kind: 'docId', row: null }))}
        </CardHeader>
        <CardContent>
          {participant.docIds.length === 0 ? (
            <p className="text-sm text-muted-foreground">No DOC IDs recorded.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>State</TableHead>
                  <TableHead>DOC number</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {participant.docIds.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell>{d.state}</TableCell>
                    <TableCell>
                      {d.docNumber !== undefined ? (
                        <span className="font-mono text-xs">{d.docNumber}</span>
                      ) : (
                        // §7.2: the row stays visible, the value is stripped
                        // without fields.justice.read.
                        <span
                          className="inline-flex items-center gap-1 text-muted-foreground"
                          title="Hidden — requires justice-history access"
                        >
                          <Lock className="h-3 w-3" /> —
                        </span>
                      )}
                    </TableCell>
                    <TableCell>{humanize(d.source)}</TableCell>
                    <TableCell className="text-right">
                      {editButton(() => setDialog({ kind: 'docId', row: d }))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Testimony consents</CardTitle>
          {addButton('Add consent', () => setDialog({ kind: 'consent', row: null }))}
        </CardHeader>
        <CardContent>
          {person.testimonyConsents.length === 0 ? (
            <p className="text-sm text-muted-foreground">No testimony consents recorded.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Scope</TableHead>
                  <TableHead>Granted</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {person.testimonyConsents.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.scope}</TableCell>
                    <TableCell>{formatDate(t.grantedAt)}</TableCell>
                    <TableCell>
                      {t.revokedAt ? (
                        <Badge variant="destructive">Revoked {formatDate(t.revokedAt)}</Badge>
                      ) : (
                        <Badge variant="success">Active</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {editButton(() => setDialog({ kind: 'consent', row: t }))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <ContactDialog
        participantId={participant.id}
        existing={dialog?.kind === 'contact' ? dialog.row : null}
        open={dialog?.kind === 'contact'}
        onOpenChange={(o) => !o && setDialog(null)}
      />
      <AddressDialog
        participantId={participant.id}
        existing={dialog?.kind === 'address' ? dialog.row : null}
        open={dialog?.kind === 'address'}
        onOpenChange={(o) => !o && setDialog(null)}
      />
      <DocIdDialog
        participantId={participant.id}
        existing={dialog?.kind === 'docId' ? dialog.row : null}
        open={dialog?.kind === 'docId'}
        onOpenChange={(o) => !o && setDialog(null)}
      />
      <ConsentDialog
        participantId={participant.id}
        existing={dialog?.kind === 'consent' ? dialog.row : null}
        open={dialog?.kind === 'consent'}
        onOpenChange={(o) => !o && setDialog(null)}
      />
    </div>
  );
}
