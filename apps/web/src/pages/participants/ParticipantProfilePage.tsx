import { useQuery } from '@tanstack/react-query';
import { DoorOpen, GraduationCap, Pencil } from 'lucide-react';
import { useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState, ErrorState, PageLoader } from '@/components/ui/spinner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDate, fullName } from '@/lib/utils';
import { CaseManagementTab } from './CaseManagementTab';
import { DocumentsTab } from './DocumentsTab';
import { EditParticipantDialog } from './EditParticipantDialog';
import { GraduateDialog } from './GraduateDialog';
import { OverviewTab } from './OverviewTab';
import { ReleaseDialog } from './ReleaseDialog';
import {
  EmploymentTab,
  HousingTab,
  InsideClassesTab,
  NotesTab,
  OutsideProgramsTab,
  ServicesTab,
} from './ProgramTabs';
import { TimelineTab } from './TimelineTab';
import type { ParticipantDetail } from './types';
import { BackLink } from '@/components/BackLink';

/** 'not_applicable' is the default in every status domain — noise as a badge. */
function headerBadge(label: string, status: string) {
  if (status === 'not_applicable') return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      {label} <StatusBadge status={status} />
    </span>
  );
}

const TAB_VALUES = [
  'overview',
  'inside',
  'outside',
  'housing',
  'employment',
  'services',
  'notes',
  'case-management',
  'documents',
  'activity',
] as const;

export function ParticipantProfilePage() {
  const { id = '' } = useParams();
  const { can } = useAuth();
  const [editOpen, setEditOpen] = useState(false);
  const [graduateOpen, setGraduateOpen] = useState(false);
  const [releaseOpen, setReleaseOpen] = useState(false);
  // The active tab lives in ?tab= so deep links out of the tabs (class,
  // home, employer…) can offer a Back that restores this exact view.
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab') ?? 'overview';
  const activeTab = (TAB_VALUES as readonly string[]).includes(tabParam) ? tabParam : 'overview';
  const setActiveTab = (value: string) => {
    setSearchParams(value === 'overview' ? {} : { tab: value }, { replace: true });
  };

  const query = useQuery({
    queryKey: ['participants', id],
    queryFn: () => api.get<ParticipantDetail>(`/participants/${id}`),
    enabled: Boolean(id),
  });

  if (query.isLoading) return <PageLoader />;
  if (query.isError) return <ErrorState error={query.error} />;
  const participant = query.data;
  if (!participant) return <ErrorState error={new Error('Participant not found')} />;

  const canUpdate = can('participants.update');
  const person = participant.person;

  return (
    <div className="space-y-4">
      <div>
        <BackLink fallbackTo="/participants" fallbackLabel="Participants" />
        <PageHeader
          className="mt-1"
          title={
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {fullName(person)}
              <span className="font-mono text-sm font-normal text-muted-foreground">
                {participant.participantNumber}
              </span>
              {person.deceasedAt ? (
                <Badge variant="secondary">Deceased {formatDate(person.deceasedAt)}</Badge>
              ) : null}
              {person.doNotContact ? <Badge variant="destructive">Do not contact</Badge> : null}
            </span>
          }
          actions={
            canUpdate ? (
              <>
                <Button variant="outline" onClick={() => setEditOpen(true)}>
                  <Pencil className="h-4 w-4" /> Edit
                </Button>
                {/* Release applies while they are inside — hide once released. */}
                {participant.insideStatus === 'enrolled' || participant.insideStatus === 'active' ? (
                  <Button variant="outline" onClick={() => setReleaseOpen(true)}>
                    <DoorOpen className="h-4 w-4" /> Record release
                  </Button>
                ) : null}
                {/* The graduate action 409s once alumni status is set — hide it then. */}
                {participant.alumniStatus === 'not_applicable' ? (
                  <Button onClick={() => setGraduateOpen(true)}>
                    <GraduationCap className="h-4 w-4" /> Graduate
                  </Button>
                ) : null}
              </>
            ) : undefined
          }
        >
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {headerBadge('Inside', participant.insideStatus)}
            {headerBadge('Outside', participant.outsideStatus)}
            {headerBadge('Alumni', participant.alumniStatus)}
            <span>
              Case manager:{' '}
              {participant.assignedCaseManager
                ? `${participant.assignedCaseManager.firstName} ${participant.assignedCaseManager.lastName}`
                : 'Unassigned'}
            </span>
            {participant.intakeDate ? (
              <span>Intake {formatDate(participant.intakeDate)}</span>
            ) : null}
            {participant.graduationDate ? (
              <span>Graduated {formatDate(participant.graduationDate)}</span>
            ) : null}
          </div>
        </PageHeader>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="inside">Inside Classes</TabsTrigger>
          <TabsTrigger value="outside">Outside Programs</TabsTrigger>
          <TabsTrigger value="housing">Housing</TabsTrigger>
          <TabsTrigger value="employment">Employment</TabsTrigger>
          <TabsTrigger value="services">Services</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
          <TabsTrigger value="case-management">Case Management</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="activity">Activity History</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <OverviewTab participant={participant} />
        </TabsContent>
        <TabsContent value="inside">
          <InsideClassesTab participantId={participant.id} />
        </TabsContent>
        <TabsContent value="outside">
          <OutsideProgramsTab participantId={participant.id} />
        </TabsContent>
        <TabsContent value="housing">
          <HousingTab participantId={participant.id} />
        </TabsContent>
        <TabsContent value="employment">
          <EmploymentTab participantId={participant.id} />
        </TabsContent>
        <TabsContent value="services">
          <ServicesTab participantId={participant.id} />
        </TabsContent>
        <TabsContent value="notes">
          <NotesTab participantId={participant.id} />
        </TabsContent>
        <TabsContent value="case-management">
          <CaseManagementTab participantId={participant.id} />
        </TabsContent>
        <TabsContent value="documents">
          <DocumentsTab participantId={participant.id} />
        </TabsContent>
        <TabsContent value="activity">
          <TimelineTab participantId={participant.id} />
        </TabsContent>
      </Tabs>

      <EditParticipantDialog
        participant={participant}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
      <GraduateDialog
        participant={participant}
        open={graduateOpen}
        onOpenChange={setGraduateOpen}
      />
      <ReleaseDialog
        participant={participant}
        open={releaseOpen}
        onOpenChange={setReleaseOpen}
      />
    </div>
  );
}
