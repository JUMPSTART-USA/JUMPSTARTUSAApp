import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardHeaderRow, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DescriptionList, InfoItem } from '@/components/ui/description-list';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { RACE_LABELS } from '@jumpstart/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDate, humanize } from '@/lib/utils';
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
  const [deleteTarget, setDeleteTarget] = useState<PersonContactRow | null>(null);
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
          <CardTitle>Person</CardTitle>
        </CardHeader>
        <CardContent>
          <DescriptionList>
            <InfoItem label="Date of birth">{formatDate(person.dateOfBirth)}</InfoItem>
            <InfoItem label="Gender">{humanize(person.gender)}</InfoItem>
            <InfoItem label="Race">
              {RACE_LABELS[person.race as keyof typeof RACE_LABELS] ?? humanize(person.race)}
            </InfoItem>
            <InfoItem label="Preferred language">{orDash(person.preferredLanguage)}</InfoItem>
            <InfoItem label="Phone">{orDash(person.primaryPhone)}</InfoItem>
            <InfoItem label="Email">{orDash(person.primaryEmail)}</InfoItem>
            <InfoItem label="Mailing address">
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
            </InfoItem>
            <InfoItem label="Contact preferences" className="sm:col-span-2">
              <span className="inline-flex flex-wrap gap-1">
                {person.doNotContact ? <Badge variant="destructive">Do not contact</Badge> : null}
                {person.mailOnly ? <Badge variant="warning">Mail only</Badge> : null}
                {person.emailOk ? <Badge variant="outline">Email OK</Badge> : null}
                {person.smsOk ? (
                  <Badge variant="outline">
                    SMS OK{person.smsConsentAt ? ` (since ${formatDate(person.smsConsentAt)})` : ''}
                  </Badge>
                ) : null}
              </span>
            </InfoItem>
            {person.deceasedAt ? (
              <InfoItem label="Deceased">{formatDate(person.deceasedAt)}</InfoItem>
            ) : null}
          </DescriptionList>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Program profile</CardTitle>
        </CardHeader>
        <CardContent>
          <DescriptionList>
            <InfoItem label="Inside status">
              <StatusBadge status={participant.insideStatus} />
            </InfoItem>
            <InfoItem label="Outside status">
              <StatusBadge status={participant.outsideStatus} />
            </InfoItem>
            <InfoItem label="Phase">{orDash(participant.phase)}</InfoItem>
            <InfoItem label="Alumni status">
              <StatusBadge status={participant.alumniStatus} />
            </InfoItem>
            <InfoItem label="Intake date">{formatDate(participant.intakeDate)}</InfoItem>
            <InfoItem label="Release date">{formatDate(participant.releaseDate)}</InfoItem>
            <InfoItem label="Graduation date">{formatDate(participant.graduationDate)}</InfoItem>
            <InfoItem label="Case manager">
              {participant.assignedCaseManager
                ? `${participant.assignedCaseManager.firstName} ${participant.assignedCaseManager.lastName}`
                : dash}
            </InfoItem>
            {participant.sexOffenderRegistry !== undefined ? (
              // §7.2 justice field class: the API omits this field entirely
              // for viewers without fields.justice.read.
              <InfoItem label="Sex offender registry">
                {participant.sexOffenderRegistry ? (
                  <Badge variant="destructive">On registry</Badge>
                ) : (
                  'No'
                )}
              </InfoItem>
            ) : null}
            {participant.notes ? (
              <InfoItem label="Notes" className="sm:col-span-2">
                <span className="whitespace-pre-wrap">{participant.notes}</span>
              </InfoItem>
            ) : null}
          </DescriptionList>

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
        <CardHeaderRow title="Contacts">
          {addButton('Add contact', () => setDialog({ kind: 'contact', row: null }))}
        </CardHeaderRow>
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
                            deleteContact.reset();
                            setDeleteTarget(c);
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
        <CardHeaderRow title="Address history">
          {addButton('Add address', () => setDialog({ kind: 'address', row: null }))}
        </CardHeaderRow>
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
        <CardHeaderRow title="DOC IDs">
          {addButton('Add DOC ID', () => setDialog({ kind: 'docId', row: null }))}
        </CardHeaderRow>
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
        <CardHeaderRow title="Testimony consents">
          {addButton('Add consent', () => setDialog({ kind: 'consent', row: null }))}
        </CardHeaderRow>
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
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Remove contact"
        description={deleteTarget ? `Remove contact "${deleteTarget.name}"?` : undefined}
        confirmLabel="Delete"
        isPending={deleteContact.isPending}
        error={deleteContact.error ? deleteContact.error.message : null}
        onConfirm={() => {
          if (deleteTarget) {
            deleteContact.mutate(deleteTarget.id, { onSuccess: () => setDeleteTarget(null) });
          }
        }}
      />
    </div>
  );
}
