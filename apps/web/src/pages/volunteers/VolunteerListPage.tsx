import { zodResolver } from '@hookform/resolvers/zod';
import {
  GENDERS,
  US_STATES,
  VOLUNTEER_STATUSES,
  volunteerCreateSchema,
  type ChapterState,
  type Gender,
  type UsState,
  type VolunteerStatus,
} from '@jumpstart/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, CalendarDays, ClipboardList, Clock, Plus } from 'lucide-react';
import { useRef, useState } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { ChapterFilterSelect, ChapterSelect } from '@/components/ChapterSelect';
import { DataTable, initialListState, type Column, type ListState } from '@/components/DataTable';
import { FormField } from '@/components/FormField';
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
import { FilterSelect } from '@/components/ui/filter-select';
import { Input, Select, Textarea } from '@/components/ui/input';
import { FormError, Notice } from '@/components/ui/notice';
import { PageHeader } from '@/components/ui/page-header';
import { PhoneInput } from '@/components/ui/phone-input';
import { ErrorState } from '@/components/ui/spinner';
import { ListToolbar, SearchInput } from '@/components/ui/toolbar';
import { api, ApiError, qs, type Paged } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { applyApiError, useDebounced } from '@/lib/form';
import { formatDate, fullName, humanize } from '@/lib/utils';
import type { BackgroundCheckRow, DuplicateCandidate, VolunteerListItem } from './types';
import { BackLink } from '@/components/BackLink';

function latestCheckSummary(check: BackgroundCheckRow | null) {
  if (!check) return <span className="text-muted-foreground">—</span>;
  // §7.2: result is stripped without fields.background_checks.read — the
  // viewer may still see that a check exists and its dates.
  if (check.result) {
    return (
      <div className="flex items-center gap-2">
              <StatusBadge status={check.result} />
        <span className="text-xs text-muted-foreground">
          {formatDate(check.completedAt ?? check.orderedAt)}
        </span>
      </div>
    );
  }
  return (
    <span className="text-xs text-muted-foreground">Ordered {formatDate(check.orderedAt)}</span>
  );
}

export function VolunteerListPage() {
  const { can } = useAuth();
  const navigate = useNavigate();

  const [listState, setListState] = useState<ListState>(initialListState);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [mentor, setMentor] = useState('');
  const [chapter, setChapter] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const debouncedSearch = useDebounced(search);

  const params = {
    page: listState.page,
    pageSize: listState.pageSize,
    sortBy: listState.sortBy,
    sortDir: listState.sortDir,
    search: debouncedSearch,
    status,
    isMentor: mentor,
    state: chapter,
  };

  const { data, isLoading, error } = useQuery({
    queryKey: ['volunteers', 'list', params],
    queryFn: () => api.get<Paged<VolunteerListItem>>(`/volunteers${qs(params)}`),
  });

  const columns: Column<VolunteerListItem>[] = [
    {
      key: 'name',
      header: 'Name',
      sortKey: 'lastName',
      render: (row) => <span className="font-medium">{fullName(row.person)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      sortKey: 'status',
      render: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: 'mentor',
      header: 'Mentor',
      render: (row) =>
        row.isMentor ? (
          <Badge variant="info">Mentor</Badge>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: 'roles',
      header: 'Roles',
      render: (row) =>
        row.volunteerRoles.length > 0 ? (
          <span className="text-sm">{row.volunteerRoles.join(', ')}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: 'location',
      header: 'Location',
      sortKey: 'state',
      render: (row) =>
        row.person.city || row.person.state ? (
          <span>{[row.person.city, row.person.state].filter(Boolean).join(', ')}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: 'latestCheck',
      header: 'Latest check',
      render: (row) => latestCheckSummary(row.latestBackgroundCheck),
    },
  ];

  return (
    <div className="space-y-4">
      <BackLink stateOnly />
      <PageHeader
        title="Volunteers"
        actions={
          <>
            <Button variant="outline" onClick={() => navigate('opportunities')}>
              <CalendarDays className="h-4 w-4" /> Opportunities
            </Button>
            <Button variant="outline" onClick={() => navigate('hours')}>
              <Clock className="h-4 w-4" /> Hours
            </Button>
            <Button variant="outline" onClick={() => navigate('expirations')}>
              <CalendarClock className="h-4 w-4" /> Expirations
            </Button>
            <Button variant="outline" onClick={() => navigate('facility-requirements')}>
              <ClipboardList className="h-4 w-4" /> Facility requirements
            </Button>
            {can('volunteers.create') ? (
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" /> New volunteer
              </Button>
            ) : null}
          </>
        }
      />

      <ListToolbar>
        <SearchInput
          placeholder="Search name or email…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setListState((s) => ({ ...s, page: 1 }));
          }}
        />
        <FilterSelect
          aria-label="Status"
          className="w-full sm:w-44"
          value={status}
          onChange={(value) => {
            setStatus(value);
            setListState((s) => ({ ...s, page: 1 }));
          }}
        >
          <option value="">All statuses</option>
          {VOLUNTEER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {humanize(s)}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect
          aria-label="Mentor"
          className="w-full sm:w-44"
          value={mentor}
          onChange={(value) => {
            setMentor(value);
            setListState((s) => ({ ...s, page: 1 }));
          }}
        >
          <option value="">Mentors & non-mentors</option>
          <option value="true">Mentors only</option>
          <option value="false">Non-mentors only</option>
        </FilterSelect>
        <ChapterFilterSelect
          value={chapter}
          onChange={(value) => {
            setChapter(value);
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
        onRowClick={(row) => navigate(`/volunteers/${row.id}`)}
        emptyMessage="No volunteers found"
      />

      <CreateVolunteerDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

// ── Create dialog with §5 duplicate-candidate handling ──────────────────────

interface VolunteerFormValues {
  person: {
    firstName: string;
    lastName: string;
    preferredName?: string;
    dateOfBirth?: string;
    gender: Gender;
    primaryPhone?: string;
    primaryEmail?: string;
    addressLine1?: string;
    city?: string;
    state?: UsState;
    zip?: string;
  };
  profile: {
    status: VolunteerStatus;
    availability?: string;
    churchAffiliation?: string;
    notes?: string;
  };
  // Chapter (§7.2): required pick for all-chapters users; stamped server-side
  // for chapter-scoped users. person.state above is a mailing address.
  chapterState?: ChapterState;
  confirmNotDuplicate: boolean;
}

const createResolver = zodResolver(volunteerCreateSchema) as unknown as Resolver<VolunteerFormValues>;

function CreateVolunteerDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [rolesText, setRolesText] = useState('');
  const [topError, setTopError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<DuplicateCandidate[] | null>(null);
  const lastPayload = useRef<Record<string, unknown> | null>(null);

  const form = useForm<VolunteerFormValues>({
    resolver: createResolver,
    defaultValues: {
      person: { firstName: '', lastName: '', gender: 'unspecified' },
      profile: { status: 'applicant' },
      confirmNotDuplicate: false,
    },
  });

  const close = (next: boolean) => {
    if (!next) {
      form.reset();
      setRolesText('');
      setTopError(null);
      setCandidates(null);
    }
    onOpenChange(next);
  };

  const create = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      api.post<{ id: string }>('/volunteers', payload),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['volunteers'] });
      close(false);
      navigate(`/volunteers/${created.id}`);
    },
    onError: (err) => {
      // §5: 409 carries candidate matches — surface them, never swallow.
      if (err instanceof ApiError && err.status === 409) {
        const body = err.body as { candidates?: DuplicateCandidate[] } | undefined;
        if (body?.candidates && body.candidates.length > 0) {
          setCandidates(body.candidates);
          setTopError(null);
          return;
        }
      }
      setTopError(applyApiError(err, form.setError));
    },
  });

  const onSubmit = form.handleSubmit((data) => {
    setTopError(null);
    const payload = {
      person: data.person,
      profile: {
        ...data.profile,
        volunteerRoles: rolesText
          .split(',')
          .map((r) => r.trim())
          .filter(Boolean),
      },
      chapterState: data.chapterState,
      confirmNotDuplicate: false,
    };
    lastPayload.current = payload;
    create.mutate(payload);
  });

  const createAnyway = () => {
    if (!lastPayload.current) return;
    create.mutate({ ...lastPayload.current, confirmNotDuplicate: true });
  };

  const { register, formState } = form;
  const personErrors = formState.errors.person ?? {};
  const profileErrors = formState.errors.profile ?? {};

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>New volunteer</DialogTitle>
          <DialogDescription>
            Creates the person record and their volunteer profile.
          </DialogDescription>
        </DialogHeader>

        {candidates ? (
          <div className="space-y-3">
            <Notice variant="warning">
              Possible duplicate{candidates.length === 1 ? '' : 's'} found. Review before creating
              a new record — duplicate people fragment service history (§5).
            </Notice>
            <div className="space-y-2">
              {candidates.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                >
                  <div>
                    <div className="font-medium">
                      {c.firstName} {c.lastName}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {[
                        c.dateOfBirth ? `DOB ${formatDate(c.dateOfBirth)}` : null,
                        c.primaryEmail,
                        c.primaryPhone,
                        [c.city, c.state].filter(Boolean).join(', ') || null,
                      ]
                        .filter(Boolean)
                        .join(' · ') || 'No contact details on file'}
                    </div>
                  </div>
                  {c.volunteerProfile && !c.volunteerProfile.deletedAt ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        close(false);
                        navigate(`/volunteers/${c.volunteerProfile!.id}`);
                      }}
                    >
                      Use existing
                    </Button>
                  ) : (
                    <Badge variant="secondary">Not a volunteer</Badge>
                  )}
                </div>
              ))}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCandidates(null)}>
                Back to form
              </Button>
              <Button onClick={createAnyway} disabled={create.isPending}>
                {create.isPending ? 'Saving…' : 'Create anyway — not a duplicate'}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="First name" required error={personErrors.firstName}>
                <Input {...register('person.firstName')} />
              </FormField>
              <FormField label="Last name" required error={personErrors.lastName}>
                <Input {...register('person.lastName')} />
              </FormField>
              <FormField label="Preferred name" error={personErrors.preferredName}>
                <Input {...register('person.preferredName')} />
              </FormField>
              <FormField label="Date of birth" error={personErrors.dateOfBirth}>
                <Input type="date" {...register('person.dateOfBirth')} />
              </FormField>
              <FormField label="Gender" error={personErrors.gender}>
                <Select {...register('person.gender')}>
                  {GENDERS.map((g) => (
                    <option key={g} value={g}>
                      {humanize(g)}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Status" error={profileErrors.status}>
                <Select {...register('profile.status')}>
                  {VOLUNTEER_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {humanize(s)}
                    </option>
                  ))}
                </Select>
              </FormField>
              <ChapterSelect
                error={formState.errors.chapterState}
                {...register('chapterState', {
                  setValueAs: (v) => (v === '' ? undefined : v),
                })}
              />
              <FormField label="Email" error={personErrors.primaryEmail}>
                <Input type="email" {...register('person.primaryEmail')} />
              </FormField>
              <FormField label="Phone" error={personErrors.primaryPhone}>
                <PhoneInput {...register('person.primaryPhone')} />
              </FormField>
              <FormField
                label="Address"
                error={personErrors.addressLine1}
                className="sm:col-span-2"
              >
                <Input {...register('person.addressLine1')} />
              </FormField>
              <FormField label="City" error={personErrors.city}>
                <Input {...register('person.city')} />
              </FormField>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="State" error={personErrors.state}>
                  <Select
                    {...register('person.state', {
                      setValueAs: (v) => (v === '' ? undefined : v),
                    })}
                  >
                    <option value="">—</option>
                    {US_STATES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </Select>
                </FormField>
                <FormField label="ZIP" error={personErrors.zip}>
                  <Input {...register('person.zip')} />
                </FormField>
              </div>
              <FormField
                label="Volunteer roles"
                hint="Comma-separated, e.g. Inside class, Transportation"
                className="sm:col-span-2"
              >
                <Input value={rolesText} onChange={(e) => setRolesText(e.target.value)} />
              </FormField>
              <FormField label="Availability" error={profileErrors.availability}>
                <Input {...register('profile.availability')} placeholder="e.g. Weekday evenings" />
              </FormField>
              <FormField label="Church affiliation" error={profileErrors.churchAffiliation}>
                <Input {...register('profile.churchAffiliation')} />
              </FormField>
              <FormField label="Notes" error={profileErrors.notes} className="sm:col-span-2">
                <Textarea rows={2} {...register('profile.notes')} />
              </FormField>
            </div>

            <FormError message={topError} />

            <DialogFooter>
              <Button variant="outline" onClick={() => close(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={create.isPending}>
                {create.isPending ? 'Saving…' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
