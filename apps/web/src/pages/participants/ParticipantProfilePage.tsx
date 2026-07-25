import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, GraduationCap, Pencil } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, PageLoader } from '@/components/ui/spinner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDate, fullName } from '@/lib/utils';
import { CaseManagementTab } from './CaseManagementTab';
import { EditParticipantDialog } from './EditParticipantDialog';
import { GraduateDialog } from './GraduateDialog';
import { OverviewTab } from './OverviewTab';
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

/** 'not_applicable' is the default in every status domain — noise as a badge. */
function headerBadge(label: string, status: string) {
  if (status === 'not_applicable') return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      {label} <StatusBadge status={status} />
    </span>
  );
}

export function ParticipantProfilePage() {
  const { id = '' } = useParams();
  const { can } = useAuth();
  const [editOpen, setEditOpen] = useState(false);
  const [graduateOpen, setGraduateOpen] = useState(false);

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
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link
            to="/participants"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Participants
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="text-2xl font-semibold">{fullName(person)}</h1>
            <span className="font-mono text-sm text-muted-foreground">
              {participant.participantNumber}
            </span>
            {person.deceasedAt ? (
              <Badge variant="secondary">Deceased {formatDate(person.deceasedAt)}</Badge>
            ) : null}
            {person.doNotContact ? <Badge variant="destructive">Do not contact</Badge> : null}
          </div>
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
        </div>

        {canUpdate ? (
          <div className="flex shrink-0 gap-2">
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4" /> Edit
            </Button>
            {/* The graduate action 409s once alumni status is set — hide it then. */}
            {participant.alumniStatus === 'not_applicable' ? (
              <Button onClick={() => setGraduateOpen(true)}>
                <GraduationCap className="h-4 w-4" /> Graduate
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      <Tabs defaultValue="overview">
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
          <EmptyState
            title="Document uploads arrive in Phase 2"
            hint="Releases, IDs and program paperwork will be stored here."
          />
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
    </div>
  );
}
