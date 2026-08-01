import { AttachmentsCard } from '@/components/AttachmentsCard';
import { useAuth } from '@/lib/auth';

/**
 * Participant documents tab — IDs, program paperwork, signed forms. Mounted
 * by ParticipantProfilePage with the same participantId prop as other tabs.
 * Confidential files are filtered server-side for staff without
 * case_notes.confidential.read.
 */
export function DocumentsTab({ participantId }: { participantId: string }) {
  const { can } = useAuth();
  return (
    <AttachmentsCard
      entityType="participant_profile"
      entityId={participantId}
      title="Documents"
      canUpload={can('participants.update')}
      canDelete={can('participants.update')}
    />
  );
}
