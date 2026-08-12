import { zodResolver } from '@hookform/resolvers/zod';
import {
  GENDERS,
  US_STATES,
  VOLUNTEER_STATUSES,
  volunteerUpdateSchema,
  type Gender,
  type UsState,
  type VolunteerStatus,
} from '@jumpstart/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil } from 'lucide-react';
import { useState } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { useParams } from 'react-router-dom';
import { P, useListParams } from '@/lib/list-params';
import { FormField } from '@/components/FormField';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DescriptionList, InfoItem } from '@/components/ui/description-list';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input, Select, Textarea } from '@/components/ui/input';
import { FormError } from '@/components/ui/notice';
import { PageHeader } from '@/components/ui/page-header';
import { PhoneInput } from '@/components/ui/phone-input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ErrorState, PageLoader } from '@/components/ui/spinner';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { applyApiError, toDateInput } from '@/lib/form';
import { formatDate, fullName, humanize } from '@/lib/utils';
import { AssignmentsTab } from './tabs/AssignmentsTab';
import { ChecksTab } from './tabs/ChecksTab';
import { ClearancesTab } from './tabs/ClearancesTab';
import { EligibilityTab } from './tabs/EligibilityTab';
import { HoursTab } from './tabs/HoursTab';
import { ServiceHistoryTab } from './tabs/ServiceHistoryTab';
import { TrainingsTab } from './tabs/TrainingsTab';
import { SignupStatusBadge, formatHours, formatTime } from './shared';
import type { VolunteerDetail } from './types';
import { BackLink } from '@/components/BackLink';
import { Link } from 'react-router-dom';

/** The tab strip's values; anything else in ?tab= falls back to the default. */
const VOLUNTEER_TABS = [
  'assignments',
  'trainings',
  'checks',
  'clearances',
  'eligibility',
  'hours',
  'history',
] as const;
type VolunteerTab = (typeof VOLUNTEER_TABS)[number];

export function VolunteerDetailPage() {
  /** 'assignments' is the default, so it is the value ABSENT from the URL. */
  const { values, set: setTab } = useListParams({ tab: P.choice(VOLUNTEER_TABS, 'assignments') });
  const tab = values.tab || 'assignments';
  const { id = '' } = useParams();
  const { can } = useAuth();
  const [editOpen, setEditOpen] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['volunteers', 'detail', id],
    queryFn: () => api.get<VolunteerDetail>(`/volunteers/${id}`),
    enabled: Boolean(id),
  });

  if (isLoading) return <PageLoader />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (!data) return null;

  const { person } = data;

  return (
    <div className="space-y-4">
      <BackLink fallbackTo="/volunteers" fallbackLabel="Volunteers" />
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {fullName(person)}
            <StatusBadge status={data.status} />
            {data.isMentor ? <Badge variant="info">Mentor</Badge> : null}
          </span>
        }
        description={`Volunteer since ${formatDate(data.createdAt)}`}
        actions={
          can('volunteers.update') ? (
            <Button onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4" /> Edit
            </Button>
          ) : null
        }
      />

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Contact</CardTitle>
          </CardHeader>
          <CardContent>
            <DescriptionList>
              <InfoItem label="Email">{person.primaryEmail}</InfoItem>
              <InfoItem label="Phone">{person.primaryPhone}</InfoItem>
              <InfoItem label="Address">
                {person.addressLine1
                  ? [person.addressLine1, person.addressLine2].filter(Boolean).join(', ')
                  : null}
              </InfoItem>
              <InfoItem label="City / State / ZIP">
                {[person.city, person.state, person.zip].filter(Boolean).join(', ') || null}
              </InfoItem>
              <InfoItem label="Date of birth">
                {person.dateOfBirth ? formatDate(person.dateOfBirth) : null}
              </InfoItem>
              <InfoItem label="Gender">
                {person.gender ? humanize(person.gender) : null}
              </InfoItem>
            </DescriptionList>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Volunteer profile</CardTitle>
          </CardHeader>
          <CardContent>
            <DescriptionList>
              <InfoItem label="Roles">
                {data.volunteerRoles.length > 0 ? data.volunteerRoles.join(', ') : null}
              </InfoItem>
              <InfoItem label="Availability">{data.availability}</InfoItem>
              <InfoItem label="Church affiliation">{data.churchAffiliation}</InfoItem>
              <InfoItem label="Mentor">
                {data.isMentor ? (data.mentorStatus ?? 'Yes') : 'No'}
              </InfoItem>
              <InfoItem label="Notes" className="sm:col-span-2">
                {data.notes}
              </InfoItem>
            </DescriptionList>
          </CardContent>
        </Card>

        {data.hoursSummary ? (
          <Card>
            <CardHeader>
              <CardTitle>Volunteer hours</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-3 rounded-md border bg-muted/30 p-3 text-center">
                <div>
                  <p className="text-2xl font-semibold">
                    {formatHours(data.hoursSummary.totalApproved)}
                  </p>
                  <p className="text-xs text-muted-foreground">Approved total</p>
                </div>
                <div>
                  <p className="text-2xl font-semibold">
                    {formatHours(data.hoursSummary.ytdApproved)}
                  </p>
                  <p className="text-xs text-muted-foreground">This year</p>
                </div>
                <div>
                  <p className="text-2xl font-semibold">{data.hoursSummary.pendingCount}</p>
                  <p className="text-xs text-muted-foreground">Pending</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {data.upcomingSignups ? (
          <Card>
            <CardHeader>
              <CardTitle>Upcoming shifts</CardTitle>
            </CardHeader>
            <CardContent>
              {data.upcomingSignups.length === 0 ? (
                <p className="text-sm text-muted-foreground">No upcoming shift signups.</p>
              ) : (
                <ul className="space-y-2">
                  {data.upcomingSignups.map((signup) => (
                    <li
                      key={signup.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
                    >
                      <div className="min-w-0">
                        <Link
                          to={`/volunteers/opportunities/${signup.shift.opportunity.id}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {signup.shift.opportunity.name}
                        </Link>
                        <span className="block text-xs text-muted-foreground">
                          {formatDate(signup.shift.shiftDate)} · {formatTime(signup.shift.startTime)}{' '}
                          – {formatTime(signup.shift.endTime)}
                          {signup.shift.role ? ` · ${signup.shift.role}` : ''}
                        </span>
                      </div>
                      <SignupStatusBadge status={signup.status} />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        ) : null}
      </div>

      {/**
        * Controlled from ?tab=, and it HAS to move in the same change as the
        * three lists inside it. Those lists now keep their page in the URL under
        * their own namespace, so a restored ?checks.page=2 on a tab strip that
        * silently reset to Assignments would leave page 2 of a list the user
        * cannot see. Radix unmounts inactive tabs, so it would not even render.
        */}
      <Tabs value={tab} onValueChange={(next) => setTab('tab', next as VolunteerTab)}>
        <TabsList>
          <TabsTrigger value="assignments">Assignments</TabsTrigger>
          <TabsTrigger value="trainings">Trainings</TabsTrigger>
          <TabsTrigger value="checks">Background Checks</TabsTrigger>
          <TabsTrigger value="clearances">Clearances</TabsTrigger>
          <TabsTrigger value="eligibility">Eligibility</TabsTrigger>
          <TabsTrigger value="hours">Hours</TabsTrigger>
          <TabsTrigger value="history">Service History</TabsTrigger>
        </TabsList>
        <TabsContent value="assignments">
          <AssignmentsTab volunteer={data} />
        </TabsContent>
        <TabsContent value="trainings">
          <TrainingsTab volunteerProfileId={data.id} />
        </TabsContent>
        <TabsContent value="checks">
          <ChecksTab personId={data.personId} />
        </TabsContent>
        <TabsContent value="clearances">
          <ClearancesTab volunteerProfileId={data.id} />
        </TabsContent>
        <TabsContent value="eligibility">
          <EligibilityTab volunteerProfileId={data.id} />
        </TabsContent>
        <TabsContent value="hours">
          <HoursTab
            volunteerProfileId={data.id}
            volunteerName={fullName(person)}
            summary={data.hoursSummary}
          />
        </TabsContent>
        <TabsContent value="history">
          <ServiceHistoryTab volunteerProfileId={data.id} />
        </TabsContent>
      </Tabs>

      <EditVolunteerDialog volunteer={data} open={editOpen} onOpenChange={setEditOpen} />
    </div>
  );
}

// ── Edit dialog (PATCH /volunteers/:id — person subset + profile) ───────────

interface VolunteerEditValues {
  person: {
    firstName?: string;
    lastName?: string;
    preferredName?: string;
    dateOfBirth?: string;
    gender?: Gender;
    primaryPhone?: string;
    primaryEmail?: string;
    addressLine1?: string;
    city?: string;
    state?: UsState;
    zip?: string;
  };
  profile: {
    status?: VolunteerStatus;
    availability?: string;
    churchAffiliation?: string;
    notes?: string;
  };
}

const updateResolver = zodResolver(volunteerUpdateSchema) as unknown as Resolver<VolunteerEditValues>;

function EditVolunteerDialog({
  volunteer,
  open,
  onOpenChange,
}: {
  volunteer: VolunteerDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [rolesText, setRolesText] = useState(volunteer.volunteerRoles.join(', '));
  const [topError, setTopError] = useState<string | null>(null);
  const { person } = volunteer;

  const form = useForm<VolunteerEditValues>({
    resolver: updateResolver,
    values: {
      person: {
        firstName: person.firstName,
        lastName: person.lastName,
        preferredName: person.preferredName ?? '',
        dateOfBirth: toDateInput(person.dateOfBirth),
        gender: (person.gender ?? 'unspecified') as Gender,
        primaryPhone: person.primaryPhone ?? '',
        primaryEmail: person.primaryEmail ?? '',
        addressLine1: person.addressLine1 ?? '',
        city: person.city ?? '',
        state: (person.state ?? undefined) as UsState | undefined,
        zip: person.zip ?? '',
      },
      profile: {
        status: volunteer.status,
        availability: volunteer.availability ?? '',
        churchAffiliation: volunteer.churchAffiliation ?? '',
        notes: volunteer.notes ?? '',
      },
    },
  });

  const update = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      api.patch(`/volunteers/${volunteer.id}`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['volunteers'] });
      setTopError(null);
      onOpenChange(false);
    },
    onError: (err) => setTopError(applyApiError(err, form.setError)),
  });

  const onSubmit = form.handleSubmit((data) => {
    setTopError(null);
    update.mutate({
      person: data.person,
      profile: {
        ...data.profile,
        // Blank inputs mean "no value" — send explicit nulls so edits can clear.
        availability: data.profile.availability ?? null,
        churchAffiliation: data.profile.churchAffiliation ?? null,
        notes: data.profile.notes ?? null,
        volunteerRoles: rolesText
          .split(',')
          .map((r) => r.trim())
          .filter(Boolean),
      },
    });
  });

  const { register, formState } = form;
  const personErrors = formState.errors.person ?? {};
  const profileErrors = formState.errors.profile ?? {};

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent unsavedChanges={form.formState.isDirty} size="xl">
        <DialogHeader>
          <DialogTitle>Edit volunteer</DialogTitle>
        </DialogHeader>
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
                  {...register('person.state', { setValueAs: (v) => (v === '' ? undefined : v) })}
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
            <FormField label="Volunteer roles" hint="Comma-separated" className="sm:col-span-2">
              <Input value={rolesText} onChange={(e) => setRolesText(e.target.value)} />
            </FormField>
            <FormField label="Availability" error={profileErrors.availability}>
              <Input {...register('profile.availability')} />
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
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={update.isPending}>
              {update.isPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
