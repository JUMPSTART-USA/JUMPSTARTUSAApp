import { zodResolver } from '@hookform/resolvers/zod';
import { X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { FieldValues, Path, Resolver, UseFormSetError } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';
import type { z } from 'zod';
import type { ContactType, NoteCategory, TaskStatus } from '@jumpstart/shared';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { api, ApiError, qs, type Paged } from '@/lib/api';
import { fullName } from '@/lib/utils';

// ── Response shapes (JSON-serialized Prisma rows from the case-management API) ─

export interface PersonName {
  firstName: string;
  lastName: string;
}

export interface FollowUpItem {
  kind: 'task' | 'note_follow_up';
  id: string;
  title: string;
  dueDate: string | null;
  participantProfileId: string | null;
  participantName: string | null;
  status?: TaskStatus;
  category?: NoteCategory;
}

export interface FollowUpQueue {
  overdue: FollowUpItem[];
  today: FollowUpItem[];
  upcoming: FollowUpItem[];
}

/**
 * List/detail rows for case notes. Confidential notes the viewer may not read
 * arrive as a dated stub (§7.3) — only id/noteDate/category/caseManagerName
 * plus content '[Confidential note]'. The optional fields below are absent on
 * stubs, which is how the UI detects them.
 */
export interface CaseNoteRow {
  id: string;
  noteDate: string;
  category: NoteCategory;
  confidential: boolean;
  content: string;
  caseManagerName: string;
  contactType?: ContactType;
  participantProfileId?: string;
  participantName?: string | null;
  followUpRequired?: boolean;
  followUpDate?: string | null;
  followUpDoneAt?: string | null;
  createdAt?: string;
}

export function isConfidentialStub(note: CaseNoteRow): boolean {
  return note.confidential && note.contactType === undefined;
}

export interface CaseServiceRow {
  id: string;
  participantProfileId: string;
  serviceType: string;
  serviceDate: string;
  providerName: string | null;
  description: string | null;
  outcome: string | null;
  followUpRequired: boolean;
  followUpDate: string | null;
  notes: string | null;
  participantProfile: { person: PersonName };
}

export interface CaseTaskRow {
  id: string;
  title: string;
  details: string | null;
  assignedToId: string;
  dueDate: string | null;
  status: TaskStatus;
  participantProfileId: string | null;
  goalId: string | null;
  outboundReferralId: string | null;
  assignedTo: PersonName;
  participantProfile: { person: PersonName } | null;
}

export interface ReferralRow {
  id: string;
  participantProfileId: string;
  vendorId: string | null;
  providerName: string | null;
  reason: string;
  referralDate: string;
  outcome: string | null;
  notes: string | null;
  vendor: { name: string } | null;
  participantProfile: { person: PersonName };
}

export interface MilestoneRow {
  id: string;
  goalId: string;
  description: string;
  dueDate: string | null;
  completedAt: string | null;
}

export interface GoalRow {
  id: string;
  servicePlanId: string;
  category: NoteCategory;
  description: string;
  targetDate: string | null;
  status: string;
  notes: string | null;
  milestones: MilestoneRow[];
}

export interface ServicePlanRow {
  id: string;
  participantProfileId: string;
  title: string;
  status: 'active' | 'completed' | 'archived';
  reviewDate: string | null;
  notes: string | null;
  participantProfile: { person: PersonName };
  _count?: { goals: number };
}

export interface ServicePlanDetail extends Omit<ServicePlanRow, '_count'> {
  goals: GoalRow[];
}

export interface NeedsAssessmentRow {
  id: string;
  participantProfileId: string;
  instrumentName: string;
  administeredAt: string;
  administeredByName: string | null;
  domainScores: Record<string, number> | null;
  summary: string | null;
  participantProfile: { person: PersonName };
}

export interface ChecklistItemRow {
  id: string;
  label: string;
  sortOrder: number;
  required: boolean;
  status: 'pending' | 'in_progress' | 'completed' | 'not_applicable';
  notes: string | null;
  completedAt: string | null;
}

export interface ChecklistRow {
  id: string;
  participantProfileId: string;
  startedAt: string;
  completedAt: string | null;
  template: { name: string } | null;
  participantProfile: { person: PersonName };
  items: ChecklistItemRow[];
}

export interface CaseloadSummaryRow {
  caseManagerId: string;
  caseManagerName: string;
  activeParticipants: number;
  notesLast7Days: number;
  overdueFollowUps: number;
  participantsNoContact30Days: number;
}

// ── Form plumbing ───────────────────────────────────────────────────────────

/**
 * Shared Zod schemas coerce string form values (dates, numbers) on parse, so
 * the resolver's output type differs from the raw form-value type — this cast
 * keeps useForm typed by the string-valued form shape.
 */
export function zodForm<T extends FieldValues>(schema: z.ZodTypeAny): Resolver<T> {
  return zodResolver(schema) as unknown as Resolver<T>;
}

/**
 * Maps an ApiError's field errors into the form; returns a top-level message
 * to display when there are no field-level paths to attach.
 */
export function applyFormErrors<T extends FieldValues>(
  err: unknown,
  setError: UseFormSetError<T>,
): string {
  if (err instanceof ApiError) {
    if (err.errors?.length) {
      for (const fieldError of err.errors) {
        setError(fieldError.path as Path<T>, { type: 'server', message: fieldError.message });
      }
      return '';
    }
    return err.message;
  }
  return err instanceof Error ? err.message : 'Request failed';
}

export function todayStr(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** ISO datetime → value usable in an <Input type="date">. */
export function dateInputValue(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 10) : '';
}

export function useDebounced<T>(value: T, ms = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

// ── Participant picker ──────────────────────────────────────────────────────

export interface ParticipantRef {
  id: string;
  name: string;
}

interface ParticipantSearchRow {
  id: string;
  person: PersonName & { preferredName?: string | null };
}

/**
 * Lightweight search-and-select against GET /participants — every screen in
 * this area filters or files records by participantProfileId.
 */
export function ParticipantPicker({
  value,
  onChange,
  placeholder = 'Search participants…',
  autoFocus,
}: {
  value: ParticipantRef | null;
  onChange: (v: ParticipantRef | null) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const debounced = useDebounced(text.trim());
  const containerRef = useRef<HTMLDivElement>(null);

  const { data, isFetching } = useQuery({
    queryKey: ['case-management', 'participant-search', debounced],
    queryFn: () =>
      api.get<Paged<ParticipantSearchRow>>(`/participants${qs({ search: debounced, pageSize: 10 })}`),
    enabled: debounced.length >= 2,
    staleTime: 30_000,
  });

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  if (value) {
    return (
      <div className="flex h-9 items-center justify-between rounded-md border border-input bg-card px-3 text-sm">
        <span className="truncate font-medium">{value.name}</span>
        <button
          type="button"
          className="ml-2 shrink-0 text-muted-foreground hover:text-foreground"
          onClick={() => onChange(null)}
          aria-label="Clear participant"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <Input
        value={text}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
      />
      {open && debounced.length >= 2 ? (
        <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-md border bg-card py-1 shadow-md">
          {isFetching ? (
            <li className="flex justify-center px-3 py-2">
              <Spinner className="h-4 w-4" />
            </li>
          ) : !data || data.items.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted-foreground">No participants found</li>
          ) : (
            data.items.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className="w-full px-3 py-1.5 text-left text-sm hover:bg-accent"
                  onClick={() => {
                    onChange({ id: p.id, name: fullName(p.person) });
                    setText('');
                    setOpen(false);
                  }}
                >
                  {fullName(p.person)}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
