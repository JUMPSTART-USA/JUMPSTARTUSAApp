import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { outboundReferralSchema } from '@jumpstart/shared';
import { ChapterFilterSelect } from '@/components/ChapterSelect';
import { DataTable, initialListState, type Column, type ListState } from '@/components/DataTable';
import { FormField } from '@/components/FormField';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FilterSelect } from '@/components/ui/filter-select';
import { Input, Select, Textarea } from '@/components/ui/input';
import { FormError } from '@/components/ui/notice';
import { SectionHeader } from '@/components/ui/page-header';
import { ListToolbar, SearchInput } from '@/components/ui/toolbar';
import { ErrorState } from '@/components/ui/spinner';
import { ParticipantPicker, type PickerOption } from '@/components/pickers';
import { api, qs, type Paged } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { applyApiError, formResolver, toDateInput, todayInput, useDebounced } from '@/lib/form';
import { formatDate, fullName } from '@/lib/utils';
import { type ReferralRow } from './shared';

interface VendorRow {
  id: string;
  name: string;
}

/** Referral-partner vendors for the partner Select; needs vendors.read. */
function useReferralPartners(enabled: boolean) {
  return useQuery({
    queryKey: ['case-management', 'referral-partners'],
    queryFn: () =>
      api.get<Paged<VendorRow>>(
        `/vendors${qs({ isReferralPartner: true, active: true, pageSize: 200, sortBy: 'name' })}`,
      ),
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}

interface ReferralFormValues {
  participantProfileId: string;
  vendorId?: string;
  providerName: string;
  reason: string;
  referralDate: string;
  outcome: string;
  notes: string;
}

function ReferralDialog({
  referral,
  open,
  onOpenChange,
}: {
  referral: ReferralRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [topError, setTopError] = useState<string | null>(null);
  const [participant, setParticipant] = useState<PickerOption | null>(
    referral
      ? { id: referral.participantProfileId, label: fullName(referral.participantProfile.person) }
      : null,
  );

  const canListVendors = can('vendors.read');
  const { data: vendors } = useReferralPartners(canListVendors);

  const { register, handleSubmit, watch, setValue, setError, formState } =
    useForm<ReferralFormValues>({
      resolver: formResolver<ReferralFormValues>(outboundReferralSchema),
      defaultValues: referral
        ? {
            participantProfileId: referral.participantProfileId,
            vendorId: referral.vendorId ?? undefined,
            providerName: referral.providerName ?? '',
            reason: referral.reason,
            referralDate: toDateInput(referral.referralDate),
            outcome: referral.outcome ?? '',
            notes: referral.notes ?? '',
          }
        : {
            participantProfileId: '',
            vendorId: undefined,
            providerName: '',
            reason: '',
            referralDate: todayInput(),
            outcome: '',
            notes: '',
          },
    });
  const vendorId = watch('vendorId');

  const save = useMutation({
    mutationFn: (values: ReferralFormValues) =>
      referral ? api.patch(`/referrals/${referral.id}`, values) : api.post('/referrals', values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['case-management'] });
      onOpenChange(false);
    },
    onError: (err) => setTopError(applyApiError(err, setError)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{referral ? 'Edit referral' : 'New referral'}</DialogTitle>
          <DialogDescription>
            Refer a participant to a partner organization or outside provider.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={handleSubmit((values) => {
            setTopError(null);
            save.mutate(values);
          })}
        >
          <FormField label="Participant" required error={formState.errors.participantProfileId}>
            <ParticipantPicker
              value={participant}
              onChange={(p) => {
                setParticipant(p);
                setValue('participantProfileId', p?.id ?? '', { shouldValidate: !!p });
              }}
            />
          </FormField>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {canListVendors ? (
              <FormField label="Partner organization" error={formState.errors.vendorId}>
                <Select
                  value={vendorId ?? ''}
                  onChange={(e) => setValue('vendorId', e.target.value || undefined)}
                >
                  <option value="">— None —</option>
                  {vendors?.items.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </Select>
              </FormField>
            ) : null}
            <FormField
              label="Provider name"
              error={formState.errors.providerName}
              hint={canListVendors ? 'Used when no partner is selected' : undefined}
            >
              <Input {...register('providerName')} />
            </FormField>
          </div>
          <FormField label="Reason" required error={formState.errors.reason}>
            <Textarea rows={3} {...register('reason')} />
          </FormField>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="Referral date" required error={formState.errors.referralDate}>
              <Input type="date" {...register('referralDate')} />
            </FormField>
            <FormField label="Outcome" error={formState.errors.outcome}>
              <Input {...register('outcome')} />
            </FormField>
          </div>
          <FormField label="Notes" error={formState.errors.notes}>
            <Textarea rows={2} {...register('notes')} />
          </FormField>
          <FormError message={topError} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? 'Saving…' : referral ? 'Save' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ReferralsPage() {
  const { can } = useAuth();
  const [listState, setListState] = useState<ListState>({ ...initialListState, sortDir: 'desc' });
  const [participant, setParticipant] = useState<PickerOption | null>(null);
  const [vendorId, setVendorId] = useState('');
  const [search, setSearch] = useState('');
  const [state, setState] = useState('');
  const [editing, setEditing] = useState<ReferralRow | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const debouncedSearch = useDebounced(search);

  const canListVendors = can('vendors.read');
  const { data: vendors } = useReferralPartners(canListVendors);
  const canUpdate = can('case_management.update');

  const params = qs({
    page: listState.page,
    pageSize: listState.pageSize,
    sortBy: listState.sortBy,
    sortDir: listState.sortDir,
    search: debouncedSearch,
    participantProfileId: participant?.id,
    vendorId,
    state,
  });

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['case-management', 'referrals', params],
    queryFn: () => api.get<Paged<ReferralRow>>(`/referrals${params}`),
  });

  const columns: Column<ReferralRow>[] = [
    {
      key: 'referralDate',
      header: 'Date',
      sortKey: 'referralDate',
      render: (r) => formatDate(r.referralDate),
      className: 'whitespace-nowrap',
    },
    {
      key: 'participant',
      header: 'Participant',
      render: (r) => fullName(r.participantProfile.person),
    },
    {
      key: 'partner',
      header: 'Partner / Provider',
      render: (r) => r.vendor?.name ?? r.providerName ?? '—',
    },
    {
      key: 'reason',
      header: 'Reason',
      className: 'max-w-sm',
      render: (r) => <span className="line-clamp-2">{r.reason}</span>,
    },
    { key: 'outcome', header: 'Outcome', render: (r) => r.outcome ?? '—' },
  ];

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Referrals"
        actions={
          can('case_management.create') ? (
            <Button
              onClick={() => {
                setEditing(null);
                setDialogOpen(true);
              }}
            >
              <Plus className="h-4 w-4" /> New referral
            </Button>
          ) : null
        }
      />

      <ListToolbar>
        <SearchInput
          placeholder="Search reason, provider, partner…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setListState((s) => ({ ...s, page: 1 }));
          }}
        />
        <div className="w-full sm:w-72">
          <ParticipantPicker
            value={participant}
            onChange={(p) => {
              setParticipant(p);
              setListState((s) => ({ ...s, page: 1 }));
            }}
          />
        </div>
        {/* Chapter scoping (§7.2): referrals derive their chapter from the
            participant — hidden for scoped users, whom the API force-filters. */}
        <ChapterFilterSelect
          value={state}
          onChange={(v) => {
            setState(v);
            setListState((s) => ({ ...s, page: 1 }));
          }}
        />
        {canListVendors ? (
          <FilterSelect
            aria-label="Partner"
            className="w-full sm:w-44"
            value={vendorId}
            onChange={(value) => {
              setVendorId(value);
              setListState((s) => ({ ...s, page: 1 }));
            }}
          >
            <option value="">All partners</option>
            {vendors?.items.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </FilterSelect>
        ) : null}
      </ListToolbar>

      {error ? <ErrorState error={error} onRetry={refetch} /> : null}
      <DataTable
        columns={columns}
        data={data}
        isLoading={isLoading}
        state={listState}
        onStateChange={setListState}
        onRowClick={
          canUpdate
            ? (r) => {
                setEditing(r);
                setDialogOpen(true);
              }
            : undefined
        }
        emptyMessage="No referrals recorded"
      />

      {dialogOpen ? (
        <ReferralDialog
          key={editing?.id ?? 'new'}
          referral={editing}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
        />
      ) : null}
    </div>
  );
}
