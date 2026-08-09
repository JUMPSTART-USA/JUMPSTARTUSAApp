import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { caseServiceSchema } from '@jumpstart/shared';
import { backTo } from '@/components/BackLink';
import { EditServiceDialog } from './edit-dialogs';
import { ChapterFilterSelect } from '@/components/ChapterSelect';
import { DataTable, initialListState, type Column, type ListState } from '@/components/DataTable';
import { FormField } from '@/components/FormField';
import { ServiceTypeSelect } from '@/components/ServiceTypeSelect';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Checkbox, Input, Label, Textarea } from '@/components/ui/input';
import { FormError } from '@/components/ui/notice';
import { SectionHeader } from '@/components/ui/page-header';
import { ListToolbar, SearchInput, ToolbarDateField } from '@/components/ui/toolbar';
import { ErrorState } from '@/components/ui/spinner';
import { ParticipantPicker, type PickerOption } from '@/components/pickers';
import { api, qs, type Paged } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { applyApiError, formResolver, todayInput, useDebounced } from '@/lib/form';
import { formatDate, fullName } from '@/lib/utils';
import { type CaseServiceRow } from './shared';

interface ServiceFormValues {
  participantProfileId: string;
  serviceType: string;
  serviceDate: string;
  providerName: string;
  description: string;
  outcome: string;
  followUpRequired: boolean;
  followUpDate: string;
  notes: string;
}

function RecordServiceDialog({
  open,
  onOpenChange,
  initialParticipant,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialParticipant: PickerOption | null;
}) {
  const queryClient = useQueryClient();
  const [participant, setParticipant] = useState<PickerOption | null>(initialParticipant);
  const [topError, setTopError] = useState<string | null>(null);

  const { register, handleSubmit, watch, setValue, setError, formState } =
    useForm<ServiceFormValues>({
      resolver: formResolver<ServiceFormValues>(caseServiceSchema),
      defaultValues: {
        participantProfileId: initialParticipant?.id ?? '',
        serviceType: '',
        serviceDate: todayInput(),
        providerName: '',
        description: '',
        outcome: '',
        followUpRequired: false,
        followUpDate: '',
        notes: '',
      },
    });
  const followUpRequired = watch('followUpRequired');
  const serviceType = watch('serviceType');

  const create = useMutation({
    mutationFn: (values: ServiceFormValues) => api.post('/case-services', values),
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
          <DialogTitle>Record service</DialogTitle>
          <DialogDescription>
            Log a service provided to or arranged for a participant.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={handleSubmit((values) => {
            setTopError(null);
            create.mutate(values);
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
            <FormField label="Service type" required error={formState.errors.serviceType}>
              <ServiceTypeSelect
                value={serviceType}
                onChange={(v) => setValue('serviceType', v, { shouldValidate: true })}
                otherInputProps={register('serviceType')}
              />
            </FormField>
            <FormField label="Service date" required error={formState.errors.serviceDate}>
              <Input type="date" {...register('serviceDate')} />
            </FormField>
          </div>
          <FormField label="Provider" error={formState.errors.providerName}>
            <Input {...register('providerName')} />
          </FormField>
          <FormField label="Description" error={formState.errors.description}>
            <Textarea rows={3} {...register('description')} />
          </FormField>
          <FormField label="Outcome" error={formState.errors.outcome}>
            <Input {...register('outcome')} />
          </FormField>
          <div className="flex items-start gap-2">
            <Checkbox id="service-follow-up" {...register('followUpRequired')} />
            <Label htmlFor="service-follow-up" className="pt-0.5">
              Follow-up required
            </Label>
          </div>
          {followUpRequired ? (
            <FormField label="Follow-up date" error={formState.errors.followUpDate}>
              <Input type="date" {...register('followUpDate')} />
            </FormField>
          ) : null}
          <FormField label="Notes" error={formState.errors.notes}>
            <Textarea rows={2} {...register('notes')} />
          </FormField>
          <FormError message={topError} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? 'Saving…' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CaseServicesPage() {
  const { can } = useAuth();
  const [listState, setListState] = useState<ListState>({ ...initialListState, sortDir: 'desc' });
  const [participant, setParticipant] = useState<PickerOption | null>(null);
  const [search, setSearch] = useState('');
  const [state, setState] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editService, setEditService] = useState<CaseServiceRow | null>(null);
  const debouncedSearch = useDebounced(search);
  const canEdit = can('case_management.update');
  const canOpenParticipant = can('participants.read');

  const params = qs({
    page: listState.page,
    pageSize: listState.pageSize,
    sortBy: listState.sortBy,
    sortDir: listState.sortDir,
    search: debouncedSearch,
    participantProfileId: participant?.id,
    state,
    from,
    to,
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ['case-management', 'case-services', params],
    queryFn: () => api.get<Paged<CaseServiceRow>>(`/case-services${params}`),
  });

  const columns: Column<CaseServiceRow>[] = [
    {
      key: 'serviceDate',
      header: 'Date',
      sortKey: 'serviceDate',
      render: (s) => formatDate(s.serviceDate),
      className: 'whitespace-nowrap',
    },
    {
      key: 'participant',
      header: 'Participant',
      render: (s) =>
        canOpenParticipant ? (
          <Link
            to={`/participants/${s.participantProfileId}`}
            {...backTo('/case-management/services', 'Services')}
            className="font-medium text-primary hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {fullName(s.participantProfile.person)}
          </Link>
        ) : (
          fullName(s.participantProfile.person)
        ),
    },
    { key: 'serviceType', header: 'Service', sortKey: 'serviceType', render: (s) => s.serviceType },
    {
      key: 'providerName',
      header: 'Provider',
      sortKey: 'providerName',
      render: (s) => s.providerName ?? '—',
    },
    { key: 'outcome', header: 'Outcome', render: (s) => s.outcome ?? '—' },
    {
      key: 'followUp',
      header: 'Follow-up',
      render: (s) =>
        s.followUpRequired ? (
          <Badge variant="warning">{s.followUpDate ? formatDate(s.followUpDate) : 'Required'}</Badge>
        ) : (
          '—'
        ),
    },
    ...(canEdit
      ? [
          {
            key: 'actions',
            header: '',
            className: 'w-10',
            render: (s: CaseServiceRow) => (
              <Button
                variant="ghost"
                size="sm"
                aria-label="Edit service"
                onClick={(e) => {
                  e.stopPropagation();
                  setEditService(s);
                }}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            ),
          } satisfies Column<CaseServiceRow>,
        ]
      : []),
  ];

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Services"
        actions={
          can('case_management.create') ? (
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4" /> Record service
            </Button>
          ) : null
        }
      />

      <ListToolbar className="items-end">
        <SearchInput
          placeholder="Search type, provider, description…"
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
        {/* Chapter scoping (§7.2): services derive their chapter from the
            participant — hidden for scoped users, whom the API force-filters. */}
        <ChapterFilterSelect
          value={state}
          onChange={(v) => {
            setState(v);
            setListState((s) => ({ ...s, page: 1 }));
          }}
        />
        <ToolbarDateField
          label="From"
          value={from}
          onChange={(e) => {
            setFrom(e.target.value);
            setListState((s) => ({ ...s, page: 1 }));
          }}
        />
        <ToolbarDateField
          label="To"
          value={to}
          onChange={(e) => {
            setTo(e.target.value);
            setListState((s) => ({ ...s, page: 1 }));
          }}
        />
      </ListToolbar>

      {error ? <ErrorState error={error} /> : null}
      <DataTable
        columns={columns}
        data={data}
        isLoading={isLoading}
        state={listState}
        onStateChange={setListState}
        emptyMessage="No services recorded"
      />

      {dialogOpen ? (
        <RecordServiceDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          initialParticipant={participant}
        />
      ) : null}
      <EditServiceDialog service={editService} onClose={() => setEditService(null)} />
    </div>
  );
}
