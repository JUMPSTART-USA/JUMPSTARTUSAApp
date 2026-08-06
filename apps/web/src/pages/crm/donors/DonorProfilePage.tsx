import { donorRelationshipSchema, INTERACTION_CHANNEL_LABELS, INTERACTION_PURPOSE_LABELS } from '@jumpstart/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleDollarSign, HeartHandshake, Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { FormField } from '@/components/FormField';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardHeaderRow, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DescriptionList, InfoItem } from '@/components/ui/description-list';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EntityPicker, type PickerOption } from '@/components/ui/entity-picker';
import { Checkbox, Input, Textarea } from '@/components/ui/input';
import { FormError } from '@/components/ui/notice';
import { PageHeader, SectionHeader } from '@/components/ui/page-header';
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
import { api, qs, type Paged } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { applyApiError, formResolver, todayInput } from '@/lib/form';
import { formatDate, formatMoney, fullName, humanize } from '@/lib/utils';
import { DonorPicker, LifecycleBadge, StatTile } from '../shared';
import type {
  Donation,
  DonationDetail,
  DonorDetail,
  DonorInteraction,
  DonorRelationshipRecord,
  DonorTask,
  HouseholdListItem,
  SoftCreditReceived,
  SoftCreditRecord,
} from '../types';
import { AcknowledgedBadge } from './DonationsListPage';
import { DonationFormDialog } from './DonationFormDialog';
import { DonorFormDialog } from './DonorFormDialog';
import { CompleteTaskDialog, DonorTaskFormDialog } from './DonorTasksPage';
import { InteractionFormDialog } from './InteractionFormDialog';
import { PledgeFormDialog } from './PledgeFormDialog';
import { RecordPaymentDialog } from './RecordPaymentDialog';
import { RecurringGiftFormDialog } from './RecurringGiftFormDialog';
import { BackLink } from '@/components/BackLink';

// ── Household management ────────────────────────────────────────────────────

function HouseholdDialog({
  open,
  onOpenChange,
  donorId,
  donorName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  donorId: string;
  donorName: string;
}) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<'existing' | 'new'>('existing');
  const [household, setHousehold] = useState<PickerOption | null>(null);
  const [name, setName] = useState('');
  const [envelopeName, setEnvelopeName] = useState('');
  const [isHead, setIsHead] = useState(false);
  const [topError, setTopError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setMode('existing');
      setHousehold(null);
      setName(`${donorName} Household`);
      setEnvelopeName('');
      setIsHead(false);
      setTopError(null);
    }
  }, [open, donorName]);

  const mutation = useMutation({
    mutationFn: async () => {
      let householdId = household?.id;
      if (mode === 'new') {
        const created = await api.post<{ id: string }>('/households', {
          name,
          envelopeName: envelopeName || undefined,
        });
        householdId = created.id;
      }
      if (!householdId) throw new Error('Choose a household');
      return api.post(`/households/${householdId}/members`, {
        donorId,
        isHeadOfHousehold: isHead,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['crm', 'donors'] });
      void queryClient.invalidateQueries({ queryKey: ['crm', 'households'] });
      onOpenChange(false);
    },
    onError: (err) => setTopError(applyApiError(err)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add to household</DialogTitle>
          <DialogDescription>
            Households group family members for combined giving and mailings.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="household-mode"
                checked={mode === 'existing'}
                onChange={() => setMode('existing')}
                className="accent-primary"
              />
              Existing household
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="household-mode"
                checked={mode === 'new'}
                onChange={() => setMode('new')}
                className="accent-primary"
              />
              New household
            </label>
          </div>

          {mode === 'existing' ? (
            <FormField label="Household">
              <EntityPicker
                value={household}
                onChange={setHousehold}
                queryKey="crm-household-picker"
                placeholder="Search households…"
                search={async (term) => {
                  const page = await api.get<Paged<HouseholdListItem>>(
                    `/households${qs({ search: term, pageSize: 8 })}`,
                  );
                  return page.items.map((h) => ({
                    id: h.id,
                    label: h.name,
                    sublabel: `${h.memberCount} member${h.memberCount === 1 ? '' : 's'}`,
                  }));
                }}
              />
            </FormField>
          ) : (
            <div className="space-y-4">
              <FormField label="Household name" required>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </FormField>
              <FormField label="Envelope name" hint="How mail is addressed, e.g. Mr. & Mrs. Smith.">
                <Input value={envelopeName} onChange={(e) => setEnvelopeName(e.target.value)} />
              </FormField>
            </div>
          )}

          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={isHead} onChange={(e) => setIsHead(e.target.checked)} />
            Head of household
          </label>

          <FormError message={topError} />
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => mutation.mutate()}
              disabled={
                mutation.isPending ||
                (mode === 'existing' ? !household : name.trim() === '')
              }
            >
              {mutation.isPending ? 'Saving…' : 'Add to household'}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Relationships ───────────────────────────────────────────────────────────

interface RelationshipFormValues {
  relatedDonorId: string;
  relationshipType: string;
  reciprocalType?: string;
  notes?: string;
}

function RelationshipDialog({
  open,
  onOpenChange,
  donorId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  donorId: string;
}) {
  const queryClient = useQueryClient();
  const [topError, setTopError] = useState<string | null>(null);
  const [related, setRelated] = useState<PickerOption | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    setValue,
    formState: { errors },
  } = useForm<RelationshipFormValues>({
    resolver: formResolver<RelationshipFormValues>(donorRelationshipSchema),
  });

  useEffect(() => {
    if (open) {
      reset({ relatedDonorId: '', relationshipType: '', reciprocalType: '', notes: '' });
      setRelated(null);
      setTopError(null);
    }
  }, [open, reset]);

  const mutation = useMutation({
    mutationFn: (values: RelationshipFormValues) =>
      api.post(`/donors/${donorId}/relationships`, values),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['crm', 'donors'] });
      onOpenChange(false);
    },
    onError: (err) => setTopError(applyApiError(err, setError)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Add relationship</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={handleSubmit((values) => mutation.mutate(values))}
          className="space-y-4"
          noValidate
        >
          <FormField label="Related donor" required error={errors.relatedDonorId}>
            <DonorPicker
              value={related}
              onChange={(d) => {
                setRelated(d);
                setValue('relatedDonorId', d?.id ?? '', { shouldValidate: Boolean(d) });
              }}
            />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label="Relationship"
              required
              error={errors.relationshipType}
              hint="How the related donor connects to this one."
            >
              <Input {...register('relationshipType')} placeholder="e.g. Spouse, Employer" />
            </FormField>
            <FormField
              label="Reciprocal"
              error={errors.reciprocalType}
              hint="Shown on the related donor's profile."
            >
              <Input {...register('reciprocalType')} placeholder="e.g. Spouse, Employee" />
            </FormField>
          </div>
          <FormField label="Notes" error={errors.notes}>
            <Textarea rows={2} {...register('notes')} />
          </FormField>
          <FormError message={topError} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Saving…' : 'Add relationship'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Soft credits ────────────────────────────────────────────────────────────

/** Manage soft credits on one gift — spouse/employer-match crediting (§6.8). */
function SoftCreditsDialog({
  donation,
  onOpenChange,
}: {
  donation: Donation;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [topError, setTopError] = useState<string | null>(null);
  const [creditedDonor, setCreditedDonor] = useState<PickerOption | null>(null);
  const [amount, setAmount] = useState(String(donation.amount));
  const [notes, setNotes] = useState('');
  const [removing, setRemoving] = useState<SoftCreditRecord | null>(null);

  const detailQuery = useQuery({
    queryKey: ['crm', 'donations', 'detail', donation.id],
    queryFn: () => api.get<DonationDetail>(`/donations/${donation.id}`),
  });
  const softCredits = detailQuery.data?.softCredits ?? [];

  const addMutation = useMutation({
    mutationFn: () =>
      api.post<SoftCreditRecord>(`/donations/${donation.id}/soft-credits`, {
        donorId: creditedDonor?.id,
        amount,
        notes: notes.trim() ? notes : undefined,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['crm'] });
      setCreditedDonor(null);
      setNotes('');
      setTopError(null);
    },
    onError: (err) => setTopError(applyApiError(err)),
  });

  const removeMutation = useMutation({
    mutationFn: (softCreditId: string) => api.delete(`/donations/soft-credits/${softCreditId}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['crm'] });
      setRemoving(null);
    },
  });

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Soft credits</DialogTitle>
          <DialogDescription>
            Credit another donor — a spouse, an employer match — for the{' '}
            {formatMoney(donation.amount)} gift of {formatDate(donation.donationDate)} without
            changing hard-credit totals.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {detailQuery.isError ? <ErrorState error={detailQuery.error} /> : null}
          {softCredits.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {detailQuery.isLoading ? 'Loading…' : 'No soft credits on this gift.'}
            </p>
          ) : (
            <ul className="space-y-1.5">
              {softCredits.map((sc) => (
                <li key={sc.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate">
                    <Link to={`/donors/${sc.donor.id}`} className="text-primary hover:underline">
                      {sc.donor.name}
                    </Link>{' '}
                    <span className="tabular-nums">{formatMoney(sc.amount)}</span>
                    {sc.notes ? <span className="text-muted-foreground"> · {sc.notes}</span> : null}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="shrink-0"
                    onClick={() => setRemoving(sc)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <div className="grid gap-4 rounded-lg border bg-muted/30 p-4 sm:grid-cols-2">
            <FormField label="Donor to credit" required className="sm:col-span-2">
              <DonorPicker value={creditedDonor} onChange={setCreditedDonor} />
            </FormField>
            <FormField label="Amount" required>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </FormField>
            <FormField label="Notes">
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
            </FormField>
          </div>

          <FormError message={topError} />
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <Button
              onClick={() => addMutation.mutate()}
              disabled={addMutation.isPending || !creditedDonor || amount.trim() === ''}
            >
              {addMutation.isPending ? 'Saving…' : 'Add soft credit'}
            </Button>
          </DialogFooter>
        </div>

        <ConfirmDialog
          open={Boolean(removing)}
          onOpenChange={(next) => {
            if (!next) setRemoving(null);
          }}
          title="Remove soft credit?"
          description={`${removing?.donor.name ?? ''} is no longer credited for this gift.`}
          confirmLabel="Remove"
          isPending={removeMutation.isPending}
          error={removeMutation.isError ? applyApiError(removeMutation.error) : null}
          onConfirm={() => {
            if (removing) removeMutation.mutate(removing.id);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

// The API returns relationship rows already read from this donor's side.
function relationshipView(rel: DonorRelationshipRecord) {
  return { label: rel.relationshipType, other: rel.relatedDonor };
}

// ── Page ────────────────────────────────────────────────────────────────────

export function DonorProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [householdOpen, setHouseholdOpen] = useState(false);
  const [removeFromHouseholdOpen, setRemoveFromHouseholdOpen] = useState(false);
  const [relationshipOpen, setRelationshipOpen] = useState(false);
  const [removingRelationship, setRemovingRelationship] = useState<DonorRelationshipRecord | null>(null);
  const [giftOpen, setGiftOpen] = useState(false);
  const [editingDonation, setEditingDonation] = useState<Donation | null>(null);
  const [softCreditDonation, setSoftCreditDonation] = useState<Donation | null>(null);
  const [removingSoftCredit, setRemovingSoftCredit] = useState<SoftCreditReceived | null>(null);
  const [pledgeOpen, setPledgeOpen] = useState(false);
  const [recurringOpen, setRecurringOpen] = useState(false);
  const [payment, setPayment] = useState<{
    endpoint: string;
    title: string;
    amount: string | number | null;
  } | null>(null);
  const [interactionOpen, setInteractionOpen] = useState(false);
  const [editingInteraction, setEditingInteraction] = useState<DonorInteraction | null>(null);
  const [deletingInteraction, setDeletingInteraction] = useState<DonorInteraction | null>(null);
  const [taskOpen, setTaskOpen] = useState(false);
  const [completingTask, setCompletingTask] = useState<DonorTask | null>(null);

  const query = useQuery({
    queryKey: ['crm', 'donors', 'detail', id],
    queryFn: () => api.get<DonorDetail>(`/donors/${id}`),
    enabled: Boolean(id),
  });

  const completedTasksQuery = useQuery({
    queryKey: ['crm', 'donor-tasks', 'completed', id],
    queryFn: () =>
      api.get<Paged<DonorTask>>(
        `/donor-tasks${qs({ donorId: id, status: 'completed', pageSize: 25, sortBy: 'dueDate', sortDir: 'desc' })}`,
      ),
    enabled: Boolean(id),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/donors/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['crm', 'donors'] });
      navigate('/donors');
    },
  });

  const setHeadMutation = useMutation({
    mutationFn: (householdId: string) =>
      api.post(`/households/${householdId}/members`, { donorId: id, isHeadOfHousehold: true }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['crm', 'donors'] }),
  });

  const removeFromHouseholdMutation = useMutation({
    mutationFn: (householdId: string) =>
      api.delete(`/households/${householdId}/members/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['crm', 'donors'] });
      setRemoveFromHouseholdOpen(false);
    },
  });

  const removeRelationshipMutation = useMutation({
    mutationFn: (relationshipId: string) => api.delete(`/donors/relationships/${relationshipId}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['crm', 'donors'] });
      setRemovingRelationship(null);
    },
  });

  const removeSoftCreditMutation = useMutation({
    mutationFn: (softCreditId: string) => api.delete(`/donations/soft-credits/${softCreditId}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['crm'] });
      setRemovingSoftCredit(null);
    },
  });

  const deleteInteractionMutation = useMutation({
    mutationFn: (interactionId: string) => api.delete(`/donor-interactions/${interactionId}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['crm'] });
      setDeletingInteraction(null);
    },
  });

  if (query.isLoading) return <PageLoader />;
  if (query.isError) return <ErrorState error={query.error} />;
  if (!query.data || !id) return null;

  const {
    donor,
    relationships,
    givingSummary,
    donations,
    softCreditsReceived,
    pledges,
    recurringGifts,
    interactions,
    openTasks,
    campaigns,
    events,
  } = query.data;
  const donorRef = { id: donor.id, name: donor.name };
  const canUpdate = can('donors.update');
  const canCreate = can('donors.create');
  const today = todayInput();

  return (
    <div className="space-y-4">
      <BackLink fallbackTo="/donors" fallbackLabel="Donors" />

      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {donor.name}
            <Badge variant="secondary">{humanize(donor.donorType)}</Badge>
            <StatusBadge status={donor.status} />
          </span>
        }
        actions={
          <>
            {canUpdate ? (
              <Button variant="outline" onClick={() => setEditOpen(true)}>
                <Pencil className="h-4 w-4" /> Edit
              </Button>
            ) : null}
            {can('donors.delete') ? (
              <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
                <Trash2 className="h-4 w-4" /> Delete
              </Button>
            ) : null}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Contact</CardTitle>
          </CardHeader>
          <CardContent>
            <DescriptionList columns={1} className="gap-y-3">
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
              <InfoItem label="Notes">
                <span className="whitespace-pre-wrap">{donor.notes ?? '—'}</span>
              </InfoItem>
            </DescriptionList>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>
              Giving summary <LifecycleBadge lifecycle={givingSummary.lifecycle} />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <StatTile label="Lifetime">{formatMoney(givingSummary.lifetime)}</StatTile>
              <StatTile label="This year">{formatMoney(givingSummary.ytd)}</StatTile>
              <StatTile label="Gifts">{givingSummary.giftCount}</StatTile>
              <StatTile label="Largest">{formatMoney(givingSummary.largestGift)}</StatTile>
              <StatTile label="Average">{formatMoney(givingSummary.averageGift)}</StatTile>
              <StatTile label="First gift">{formatDate(givingSummary.firstGiftDate)}</StatTile>
              <StatTile label="Last gift">{formatDate(givingSummary.lastGiftDate)}</StatTile>
              <StatTile label="Soft credits">{formatMoney(givingSummary.softCreditTotal)}</StatTile>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeaderRow title="Household">
            {canUpdate ? (
              donor.household ? (
                <div className="flex flex-wrap gap-1.5">
                  {!donor.isHeadOfHousehold ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={setHeadMutation.isPending}
                      onClick={() => setHeadMutation.mutate(donor.household!.id)}
                    >
                      Set as head
                    </Button>
                  ) : null}
                  <Button size="sm" variant="ghost" onClick={() => setHouseholdOpen(true)}>
                    Change
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setRemoveFromHouseholdOpen(true)}
                  >
                    Remove
                  </Button>
                </div>
              ) : (
                <Button size="sm" variant="outline" onClick={() => setHouseholdOpen(true)}>
                  <Plus className="h-3.5 w-3.5" /> Add to household
                </Button>
              )
            ) : null}
          </CardHeaderRow>
          <CardContent>
            {donor.household ? (
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-medium">{donor.household.name}</p>
                  {donor.household.envelopeName ? (
                    <p className="text-xs text-muted-foreground">
                      Envelope: {donor.household.envelopeName}
                    </p>
                  ) : null}
                </div>
                <ul className="space-y-1.5">
                  {donor.household.members.map((member) => (
                    <li key={member.id} className="flex items-center gap-2 text-sm">
                      {member.id === donor.id ? (
                        <span>{member.name}</span>
                      ) : (
                        <Link to={`/donors/${member.id}`} className="text-primary hover:underline">
                          {member.name}
                        </Link>
                      )}
                      {member.isHeadOfHousehold ? <Badge variant="gold">Head</Badge> : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Not part of a household.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeaderRow title="Relationships">
            {canUpdate ? (
              <Button size="sm" variant="outline" onClick={() => setRelationshipOpen(true)}>
                <Plus className="h-3.5 w-3.5" /> Add
              </Button>
            ) : null}
          </CardHeaderRow>
          <CardContent>
            {relationships.length === 0 ? (
              <p className="text-sm text-muted-foreground">No relationships recorded.</p>
            ) : (
              <ul className="space-y-1.5">
                {relationships.map((rel) => {
                  const view = relationshipView(rel);
                  return (
                    <li key={rel.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="min-w-0 truncate">
                        <span className="text-muted-foreground">{view.label}:</span>{' '}
                        <Link to={`/donors/${view.other.id}`} className="text-primary hover:underline">
                          {view.other.name}
                        </Link>
                      </span>
                      {canUpdate ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="shrink-0"
                          onClick={() => setRemovingRelationship(rel)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="giving">
        <TabsList>
          <TabsTrigger value="giving">Giving</TabsTrigger>
          <TabsTrigger value="schedules">Pledges &amp; Recurring</TabsTrigger>
          <TabsTrigger value="interactions">Interactions</TabsTrigger>
          <TabsTrigger value="tasks">Tasks</TabsTrigger>
          <TabsTrigger value="involvement">Involvement</TabsTrigger>
        </TabsList>

        <TabsContent value="giving" className="space-y-4">
          <SectionHeader
            title="Donations"
            actions={
              canCreate ? (
                <Button onClick={() => setGiftOpen(true)}>
                  <Plus className="h-4 w-4" /> Record gift
                </Button>
              ) : null
            }
          />
          {donations.length === 0 ? (
            <p className="text-sm text-muted-foreground">No donations on record.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Fund</TableHead>
                  <TableHead>Appeal</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Campaign</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead>Acknowledged</TableHead>
                  {canUpdate ? <TableHead className="text-right">Soft credits</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {donations.map((d) => (
                  <TableRow
                    key={d.id}
                    className={canUpdate ? 'cursor-pointer' : undefined}
                    onClick={
                      canUpdate
                        ? () => setEditingDonation({ ...d, donor: donorRef })
                        : undefined
                    }
                  >
                    <TableCell>{formatDate(d.donationDate)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(d.amount)}
                    </TableCell>
                    <TableCell>{d.fund?.name ?? '—'}</TableCell>
                    <TableCell>{d.appeal?.name ?? '—'}</TableCell>
                    <TableCell>{d.paymentMethod ? humanize(d.paymentMethod) : '—'}</TableCell>
                    <TableCell>
                      {d.campaign ? (
                        <Link
                          to={`/campaigns/${d.campaign.id}`}
                          className="text-primary hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {d.campaign.name}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell>
                      {d.event ? (
                        <Link
                          to={`/events/${d.event.id}`}
                          className="text-primary hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {d.event.name}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell>
                      <AcknowledgedBadge acknowledgedAt={d.acknowledgedAt} />
                    </TableCell>
                    {canUpdate ? (
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSoftCreditDonation(d);
                          }}
                        >
                          <HeartHandshake className="h-3.5 w-3.5" /> Soft credits
                        </Button>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {softCreditsReceived.length > 0 ? (
            <>
              <SectionHeader title="Soft credits received" />
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>From</TableHead>
                    <TableHead className="text-right">Credited</TableHead>
                    <TableHead>Notes</TableHead>
                    {canUpdate ? <TableHead /> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {softCreditsReceived.map((sc) => (
                    <TableRow key={sc.id}>
                      <TableCell>{formatDate(sc.donation.donationDate)}</TableCell>
                      <TableCell>
                        {sc.donation.donor ? (
                          <Link
                            to={`/donors/${sc.donation.donor.id}`}
                            className="text-primary hover:underline"
                          >
                            {sc.donation.donor.name}
                          </Link>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMoney(sc.amount)}
                      </TableCell>
                      <TableCell className="max-w-[240px] truncate">{sc.notes ?? '—'}</TableCell>
                      {canUpdate ? (
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setRemovingSoftCredit(sc)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          ) : null}
        </TabsContent>

        <TabsContent value="schedules" className="space-y-4">
          <SectionHeader
            title="Pledges"
            actions={
              canCreate ? (
                <Button onClick={() => setPledgeOpen(true)}>
                  <Plus className="h-4 w-4" /> New pledge
                </Button>
              ) : null
            }
          />
          {pledges.length === 0 ? (
            <p className="text-sm text-muted-foreground">No pledges on record.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead>Status</TableHead>
                  {canCreate ? <TableHead className="text-right">Actions</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {pledges.map((p) => (
                  <TableRow
                    key={p.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/donors/pledges/${p.id}`)}
                  >
                    <TableCell>{formatDate(p.pledgeDate)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(p.totalAmount)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(p.amountPaid)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(p.balance)}
                    </TableCell>
                    <TableCell>
                      <span className="flex flex-wrap items-center gap-1.5">
                        <StatusBadge status={p.status} />
                        {p.inArrears && p.status === 'active' ? (
                          <Badge variant="warning">In arrears</Badge>
                        ) : null}
                      </span>
                    </TableCell>
                    {canCreate ? (
                      <TableCell className="text-right">
                        {p.status === 'active' ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPayment({
                                endpoint: `/pledges/${p.id}/payments`,
                                title: 'Record pledge payment',
                                amount: p.installmentAmount ?? p.balance,
                              });
                            }}
                          >
                            <CircleDollarSign className="h-3.5 w-3.5" /> Record payment
                          </Button>
                        ) : null}
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          <SectionHeader
            title="Recurring gifts"
            actions={
              canCreate ? (
                <Button onClick={() => setRecurringOpen(true)}>
                  <Plus className="h-4 w-4" /> New recurring gift
                </Button>
              ) : null
            }
          />
          {recurringGifts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No recurring gifts on record.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Frequency</TableHead>
                  <TableHead>Next gift</TableHead>
                  <TableHead>Last payment</TableHead>
                  <TableHead>Status</TableHead>
                  {canCreate ? <TableHead className="text-right">Actions</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {recurringGifts.map((g) => (
                  <TableRow
                    key={g.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/donors/recurring/${g.id}`)}
                  >
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(g.amount)}
                    </TableCell>
                    <TableCell>{humanize(g.frequency)}</TableCell>
                    <TableCell>
                      <span className="flex flex-wrap items-center gap-1.5">
                        {formatDate(g.nextGiftDate)}
                        {g.isOverdue ? <Badge variant="warning">Overdue</Badge> : null}
                      </span>
                    </TableCell>
                    <TableCell>{formatDate(g.lastPaymentDate)}</TableCell>
                    <TableCell>
                      <StatusBadge status={g.status} />
                    </TableCell>
                    {canCreate ? (
                      <TableCell className="text-right">
                        {g.status === 'active' ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPayment({
                                endpoint: `/recurring-gifts/${g.id}/payments`,
                                title: 'Record recurring payment',
                                amount: g.amount,
                              });
                            }}
                          >
                            <CircleDollarSign className="h-3.5 w-3.5" /> Record payment
                          </Button>
                        ) : null}
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>

        <TabsContent value="interactions" className="space-y-4">
          <SectionHeader
            title="Recent interactions"
            description="The ten most recent touches."
            actions={
              canCreate ? (
                <Button onClick={() => setInteractionOpen(true)}>
                  <Plus className="h-4 w-4" /> Log interaction
                </Button>
              ) : null
            }
          />
          {interactions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No interactions logged yet.</p>
          ) : (
            <ul className="space-y-2">
              {interactions.map((interaction) => (
                <li
                  key={interaction.id}
                  className="flex flex-wrap items-start justify-between gap-2 rounded-lg border bg-card p-3 shadow-card"
                >
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm font-medium">{interaction.subject}</p>
                    <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      {formatDate(interaction.date)}
                      <Badge variant="secondary">
                        {INTERACTION_CHANNEL_LABELS[interaction.channel]}
                      </Badge>
                      <Badge variant="outline">
                        {INTERACTION_PURPOSE_LABELS[interaction.purpose]}
                      </Badge>
                      {interaction.isInbound ? <Badge variant="info">Inbound</Badge> : null}
                    </p>
                    {interaction.notes ? (
                      <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                        {interaction.notes}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    {canUpdate ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditingInteraction(interaction)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    ) : null}
                    {can('donors.delete') ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setDeletingInteraction(interaction)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="tasks" className="space-y-4">
          <SectionHeader
            title="Open tasks"
            actions={
              canCreate ? (
                <Button onClick={() => setTaskOpen(true)}>
                  <Plus className="h-4 w-4" /> New task
                </Button>
              ) : null
            }
          />
          {openTasks.length === 0 ? (
            <p className="text-sm text-muted-foreground">No open tasks.</p>
          ) : (
            <ul className="space-y-2">
              {openTasks.map((task) => {
                const overdue = task.dueDate ? task.dueDate.slice(0, 10) < today : false;
                return (
                  <li
                    key={task.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card p-3 shadow-card"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{task.subject}</p>
                      <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        Due {formatDate(task.dueDate)}
                        {overdue ? <Badge variant="destructive">Overdue</Badge> : null}
                      </p>
                    </div>
                    {canUpdate ? (
                      <Button size="sm" variant="outline" onClick={() => setCompletingTask(task)}>
                        Complete
                      </Button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}

          <SectionHeader title="Completed" />
          {(completedTasksQuery.data?.items.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">No completed tasks.</p>
          ) : (
            <ul className="space-y-1.5">
              {completedTasksQuery.data?.items.map((task) => (
                <li key={task.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-muted-foreground">{formatDate(task.completedAt)}</span>
                  {task.subject}
                </li>
              ))}
            </ul>
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

      {/* ── Dialogs ─────────────────────────────────────────────────────── */}

      <DonorFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        donor={donor}
        person={donor.person}
      />
      <HouseholdDialog
        open={householdOpen}
        onOpenChange={setHouseholdOpen}
        donorId={donor.id}
        donorName={donor.name}
      />
      <RelationshipDialog
        open={relationshipOpen}
        onOpenChange={setRelationshipOpen}
        donorId={donor.id}
      />
      <DonationFormDialog open={giftOpen} onOpenChange={setGiftOpen} donorRef={donorRef} />
      <DonationFormDialog
        open={Boolean(editingDonation)}
        onOpenChange={(next) => {
          if (!next) setEditingDonation(null);
        }}
        donation={editingDonation ?? undefined}
        donorRef={donorRef}
      />
      {softCreditDonation ? (
        <SoftCreditsDialog
          donation={softCreditDonation}
          onOpenChange={(next) => {
            if (!next) setSoftCreditDonation(null);
          }}
        />
      ) : null}
      <PledgeFormDialog open={pledgeOpen} onOpenChange={setPledgeOpen} donorRef={donorRef} />
      <RecurringGiftFormDialog
        open={recurringOpen}
        onOpenChange={setRecurringOpen}
        donorRef={donorRef}
      />
      {payment ? (
        <RecordPaymentDialog
          open
          onOpenChange={(next) => {
            if (!next) setPayment(null);
          }}
          endpoint={payment.endpoint}
          title={payment.title}
          defaultAmount={payment.amount}
        />
      ) : null}
      <InteractionFormDialog
        open={interactionOpen}
        onOpenChange={setInteractionOpen}
        donorId={donor.id}
      />
      <InteractionFormDialog
        open={Boolean(editingInteraction)}
        onOpenChange={(next) => {
          if (!next) setEditingInteraction(null);
        }}
        donorId={donor.id}
        interaction={editingInteraction ?? undefined}
      />
      <DonorTaskFormDialog open={taskOpen} onOpenChange={setTaskOpen} donorRef={donorRef} />
      <CompleteTaskDialog
        task={completingTask}
        onOpenChange={(next) => {
          if (!next) setCompletingTask(null);
        }}
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete donor?"
        description={`“${donor.name}” is removed from lists — their gift history is retained.`}
        isPending={deleteMutation.isPending}
        error={deleteMutation.isError ? applyApiError(deleteMutation.error) : null}
        onConfirm={() => deleteMutation.mutate()}
      />
      <ConfirmDialog
        open={removeFromHouseholdOpen}
        onOpenChange={setRemoveFromHouseholdOpen}
        title="Remove from household?"
        description={`${donor.name} leaves “${donor.household?.name ?? ''}”. The household itself is kept.`}
        confirmLabel="Remove"
        isPending={removeFromHouseholdMutation.isPending}
        error={
          removeFromHouseholdMutation.isError
            ? applyApiError(removeFromHouseholdMutation.error)
            : null
        }
        onConfirm={() => {
          if (donor.household) removeFromHouseholdMutation.mutate(donor.household.id);
        }}
      />
      <ConfirmDialog
        open={Boolean(removingRelationship)}
        onOpenChange={(next) => {
          if (!next) setRemovingRelationship(null);
        }}
        title="Remove relationship?"
        description="The connection is removed from both donor profiles."
        confirmLabel="Remove"
        isPending={removeRelationshipMutation.isPending}
        error={
          removeRelationshipMutation.isError
            ? applyApiError(removeRelationshipMutation.error)
            : null
        }
        onConfirm={() => {
          if (removingRelationship) removeRelationshipMutation.mutate(removingRelationship.id);
        }}
      />
      <ConfirmDialog
        open={Boolean(removingSoftCredit)}
        onOpenChange={(next) => {
          if (!next) setRemovingSoftCredit(null);
        }}
        title="Remove soft credit?"
        description={`${donor.name} is no longer credited for this gift. The gift itself is unchanged.`}
        confirmLabel="Remove"
        isPending={removeSoftCreditMutation.isPending}
        error={
          removeSoftCreditMutation.isError
            ? applyApiError(removeSoftCreditMutation.error)
            : null
        }
        onConfirm={() => {
          if (removingSoftCredit) removeSoftCreditMutation.mutate(removingSoftCredit.id);
        }}
      />
      <ConfirmDialog
        open={Boolean(deletingInteraction)}
        onOpenChange={(next) => {
          if (!next) setDeletingInteraction(null);
        }}
        title="Delete interaction?"
        description="The interaction is permanently removed from the donor's history."
        isPending={deleteInteractionMutation.isPending}
        error={
          deleteInteractionMutation.isError
            ? applyApiError(deleteInteractionMutation.error)
            : null
        }
        onConfirm={() => {
          if (deletingInteraction) deleteInteractionMutation.mutate(deletingInteraction.id);
        }}
      />
    </div>
  );
}

