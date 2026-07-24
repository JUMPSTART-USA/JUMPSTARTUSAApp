import { zodResolver } from '@hookform/resolvers/zod';
import { donorSchema } from '@jumpstart/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Pencil } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { Link, useParams } from 'react-router-dom';
import { FormField } from '@/components/FormField';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/input';
import { ErrorState, PageLoader } from '@/components/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDate, formatMoney, fullName, humanize } from '@/lib/utils';
import { applyApiErrors, InfoItem, PersonSearch, type PersonHit } from '../shared';
import type { DonorDetail } from '../types';

// Bloomerang owns everything else — the platform PATCHes only these (§6.8).
const donorLocalSchema = donorSchema.pick({ personId: true, notes: true }).partial();

interface DonorLocalFormValues {
  personId?: string;
  notes?: string;
}

function EditLocalFieldsDialog({
  open,
  onOpenChange,
  donorId,
  currentNotes,
  currentPerson,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  donorId: string;
  currentNotes: string | null;
  currentPerson: PersonHit | null;
}) {
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const [person, setPerson] = useState<PersonHit | null>(currentPerson);

  const form = useForm<DonorLocalFormValues>({
    resolver: zodResolver(donorLocalSchema) as unknown as Resolver<DonorLocalFormValues>,
  });

  useEffect(() => {
    if (open) {
      form.reset({ personId: currentPerson?.personId, notes: currentNotes ?? '' });
      setPerson(currentPerson);
      setFormError(null);
    }
  }, [open]);

  const mutation = useMutation({
    mutationFn: (values: DonorLocalFormValues) => api.patch(`/donors/${donorId}`, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'donors'] });
      onOpenChange(false);
    },
    onError: (err) => setFormError(applyApiErrors(err, form.setError)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit local fields</DialogTitle>
          <DialogDescription>
            Only the person link and local notes are stored here — every other donor field is
            managed in Bloomerang.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
          className="space-y-4"
        >
          <FormField label="Linked person" error={form.formState.errors.personId}>
            <PersonSearch
              selected={person}
              onSelect={(hit) => {
                setPerson(hit);
                form.setValue('personId', hit?.personId, { shouldDirty: true });
              }}
            />
          </FormField>
          <FormField label="Local notes" error={form.formState.errors.notes}>
            <Textarea rows={4} {...form.register('notes')} />
          </FormField>
          {formError ? <ErrorState error={new Error(formError)} /> : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DonorProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();
  const [editOpen, setEditOpen] = useState(false);

  const query = useQuery({
    queryKey: ['crm', 'donors', 'detail', id],
    queryFn: () => api.get<DonorDetail>(`/donors/${id}`),
    enabled: Boolean(id),
  });

  if (query.isLoading) return <PageLoader />;
  if (query.isError) return <ErrorState error={query.error} />;
  if (!query.data) return null;

  const { donor, donations, lifetimeGiving, lastGiftDate, campaigns, events } = query.data;
  const linkedPerson: PersonHit | null = donor.person
    ? { personId: donor.person.id, name: fullName(donor.person), source: 'Linked' }
    : null;

  return (
    <div className="space-y-4">
      <Link
        to="/donors"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Donors
      </Link>

      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{donor.name}</h1>
          <Badge variant="secondary">{humanize(donor.donorType)}</Badge>
          <StatusBadge status={donor.status} />
        </div>
        {can('donors.update') ? (
          <Button variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil className="h-4 w-4" /> Edit local fields
          </Button>
        ) : null}
      </div>

      <div className="rounded-md border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm text-sky-900">
        This donor record is managed in Bloomerang. Contact and giving data sync automatically —
        only the person link and local notes are edited here.
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Contact</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3">
              <InfoItem label="Contact person">{donor.contactPerson ?? '—'}</InfoItem>
              <InfoItem label="Email">{donor.email ?? '—'}</InfoItem>
              <InfoItem label="Phone">{donor.phone ?? '—'}</InfoItem>
              <InfoItem label="Address">
                {[donor.addressLine1, [donor.city, donor.state].filter(Boolean).join(', '), donor.zip]
                  .filter(Boolean)
                  .join(' · ') || '—'}
              </InfoItem>
              <InfoItem label="Linked person">
                {donor.person ? fullName(donor.person) : 'Not linked'}
              </InfoItem>
              <InfoItem label="Last synced">{formatDate(donor.lastSyncedAt)}</InfoItem>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Giving</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3">
              <InfoItem label="Lifetime giving">
                <span className="text-lg font-semibold tabular-nums">
                  {formatMoney(lifetimeGiving)}
                </span>
              </InfoItem>
              <InfoItem label="Gifts">{donations.length}</InfoItem>
              <InfoItem label="Last gift">{formatDate(lastGiftDate)}</InfoItem>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Local notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm">
              {donor.notes || <span className="text-muted-foreground">No local notes</span>}
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="history">
        <TabsList>
          <TabsTrigger value="history">Donation history</TabsTrigger>
          <TabsTrigger value="involvement">Involvement</TabsTrigger>
        </TabsList>

        <TabsContent value="history">
          {donations.length === 0 ? (
            <p className="text-sm text-muted-foreground">No donations on record.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Fund</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Recurring</TableHead>
                  <TableHead>Campaign</TableHead>
                  <TableHead>Event</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {donations.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell>{formatDate(d.donationDate)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(d.amount)}
                    </TableCell>
                    <TableCell>{d.fund ?? '—'}</TableCell>
                    <TableCell>{d.paymentMethod ?? '—'}</TableCell>
                    <TableCell>{d.isRecurring ? <Badge variant="info">Recurring</Badge> : '—'}</TableCell>
                    <TableCell>
                      {d.campaign ? (
                        <Link to={`/campaigns/${d.campaign.id}`} className="text-primary hover:underline">
                          {d.campaign.name}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell>
                      {d.event ? (
                        <Link to={`/events/${d.event.id}`} className="text-primary hover:underline">
                          {d.event.name}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>

        <TabsContent value="involvement">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Campaigns supported</CardTitle>
              </CardHeader>
              <CardContent>
                {campaigns.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No campaign gifts.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {campaigns.map((c) => (
                      <li key={c.id}>
                        <Link to={`/campaigns/${c.id}`} className="text-sm text-primary hover:underline">
                          {c.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Events supported</CardTitle>
              </CardHeader>
              <CardContent>
                {events.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No event-linked gifts.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {events.map((e) => (
                      <li key={e.id}>
                        <Link to={`/events/${e.id}`} className="text-sm text-primary hover:underline">
                          {e.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {id ? (
        <EditLocalFieldsDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          donorId={id}
          currentNotes={donor.notes}
          currentPerson={linkedPerson}
        />
      ) : null}
    </div>
  );
}
