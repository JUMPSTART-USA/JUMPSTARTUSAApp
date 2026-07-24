import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock, Plus } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import {
  caseNoteSchema,
  CONTACT_TYPES,
  NOTE_CATEGORIES,
  type ContactType,
  type NoteCategory,
} from '@jumpstart/shared';
import { DataTable, initialListState, type Column, type ListState } from '@/components/DataTable';
import { FormField } from '@/components/FormField';
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
import { Checkbox, Input, Label, Select, Textarea } from '@/components/ui/input';
import { ErrorState, Spinner } from '@/components/ui/spinner';
import { api, qs, type Paged } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDate, humanize } from '@/lib/utils';
import {
  applyFormErrors,
  isConfidentialStub,
  ParticipantPicker,
  todayStr,
  zodForm,
  type CaseNoteRow,
  type ParticipantRef,
} from './shared';

const LAST_USED_KEY = 'jumpstart.caseNotes.lastUsed';

interface LastUsed {
  category: NoteCategory;
  contactType: ContactType;
}

function readLastUsed(): LastUsed {
  try {
    const raw = localStorage.getItem(LAST_USED_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<LastUsed>;
      return {
        category: NOTE_CATEGORIES.includes(parsed.category as NoteCategory)
          ? (parsed.category as NoteCategory)
          : 'general',
        contactType: CONTACT_TYPES.includes(parsed.contactType as ContactType)
          ? (parsed.contactType as ContactType)
          : 'in_person',
      };
    }
  } catch {
    // ignore bad localStorage payloads
  }
  return { category: 'general', contactType: 'in_person' };
}

interface NoteFormValues {
  participantProfileId: string;
  noteDate: string;
  contactType: ContactType;
  category: NoteCategory;
  content: string;
  followUpRequired: boolean;
  followUpDate: string;
  confidential: boolean;
}

/** Fast daily-entry dialog (§6.5): category/contact type default to last used. */
function NewNoteDialog({
  open,
  onOpenChange,
  initialParticipant,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialParticipant: ParticipantRef | null;
}) {
  const queryClient = useQueryClient();
  const [participant, setParticipant] = useState<ParticipantRef | null>(initialParticipant);
  const [topError, setTopError] = useState('');

  const form = useForm<NoteFormValues>({
    resolver: zodForm<NoteFormValues>(caseNoteSchema),
    defaultValues: {
      participantProfileId: initialParticipant?.id ?? '',
      noteDate: todayStr(),
      ...readLastUsed(),
      content: '',
      followUpRequired: false,
      followUpDate: '',
      confidential: false,
    },
  });
  const { register, handleSubmit, watch, setValue, setError, reset, formState } = form;
  const followUpRequired = watch('followUpRequired');

  const create = useMutation({
    mutationFn: (values: NoteFormValues) => api.post('/case-notes', values),
    onSuccess: (_data, values) => {
      localStorage.setItem(
        LAST_USED_KEY,
        JSON.stringify({ category: values.category, contactType: values.contactType }),
      );
      queryClient.invalidateQueries({ queryKey: ['case-management'] });
      onOpenChange(false);
    },
    onError: (err) => setTopError(applyFormErrors(err, setError)),
  });

  const openChange = (next: boolean) => {
    if (next) {
      const last = readLastUsed();
      setParticipant(initialParticipant);
      setTopError('');
      reset({
        participantProfileId: initialParticipant?.id ?? '',
        noteDate: todayStr(),
        category: last.category,
        contactType: last.contactType,
        content: '',
        followUpRequired: false,
        followUpDate: '',
        confidential: false,
      });
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={openChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>New case note</DialogTitle>
          <DialogDescription>Log a contact with a participant.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={handleSubmit((values) => {
            setTopError('');
            create.mutate(values);
          })}
        >
          <FormField
            label="Participant"
            required
            error={formState.errors.participantProfileId}
          >
            <ParticipantPicker
              value={participant}
              autoFocus={!initialParticipant}
              onChange={(p) => {
                setParticipant(p);
                setValue('participantProfileId', p?.id ?? '', { shouldValidate: !!p });
              }}
            />
          </FormField>
          <div className="grid grid-cols-3 gap-3">
            <FormField label="Date" required error={formState.errors.noteDate}>
              <Input type="date" max={todayStr()} {...register('noteDate')} />
            </FormField>
            <FormField label="Contact type" required error={formState.errors.contactType}>
              <Select {...register('contactType')}>
                {CONTACT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {humanize(t)}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Category" required error={formState.errors.category}>
              <Select {...register('category')}>
                {NOTE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {humanize(c)}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>
          <FormField label="Note" required error={formState.errors.content}>
            <Textarea rows={5} autoFocus={!!initialParticipant} {...register('content')} />
          </FormField>
          <div className="flex items-start gap-2">
            <Checkbox id="note-follow-up" {...register('followUpRequired')} />
            <Label htmlFor="note-follow-up" className="pt-0.5">
              Follow-up required
            </Label>
          </div>
          {followUpRequired ? (
            <FormField label="Follow-up date" required error={formState.errors.followUpDate}>
              <Input type="date" {...register('followUpDate')} />
            </FormField>
          ) : null}
          <div className="space-y-1.5 rounded-md border bg-muted/40 p-3">
            <div className="flex items-start gap-2">
              <Checkbox id="note-confidential" {...register('confidential')} />
              <Label htmlFor="note-confidential" className="flex items-center gap-1 pt-0.5">
                <Lock className="h-3.5 w-3.5" /> Confidential
              </Label>
            </div>
            {/* §7.3 — staff must know exactly who can read before marking */}
            <p className="text-xs text-muted-foreground">
              Confidential note content is readable only by you (the author), the participant&apos;s
              current assigned case manager, and supervisors with confidential-note access. Everyone
              else sees just the date, category, and author.
            </p>
          </div>
          {topError ? <p className="text-sm text-destructive">{topError}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? 'Saving…' : 'Save note'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Full-note reader — fetches by id so confidential reads are audit-logged. */
function NoteViewDialog({ noteId, onClose }: { noteId: string | null; onClose: () => void }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['case-management', 'case-note', noteId],
    queryFn: () => api.get<CaseNoteRow>(`/case-notes/${noteId}`),
    enabled: !!noteId,
  });

  return (
    <Dialog open={!!noteId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : error ? (
          <ErrorState error={error} />
        ) : data ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {data.confidential ? <Lock className="h-4 w-4" /> : null}
                Case note · {formatDate(data.noteDate)}
              </DialogTitle>
              <DialogDescription>
                {data.participantName ?? 'Confidential'} · {humanize(data.category)}
                {data.contactType ? <> · {humanize(data.contactType)}</> : null} · by{' '}
                {data.caseManagerName}
              </DialogDescription>
            </DialogHeader>
            {isConfidentialStub(data) ? (
              <p className="text-sm italic text-muted-foreground">
                This note is confidential. Only the author, the participant&apos;s assigned case
                manager, and supervisors with confidential-note access can read it.
              </p>
            ) : (
              <p className="whitespace-pre-wrap text-sm">{data.content}</p>
            )}
            {data.followUpRequired ? (
              <p className="text-sm text-muted-foreground">
                Follow-up {data.followUpDoneAt ? 'completed' : 'due'}:{' '}
                {formatDate(data.followUpDoneAt ?? data.followUpDate)}
              </p>
            ) : null}
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export function CaseNotesPage() {
  const { can } = useAuth();
  const [listState, setListState] = useState<ListState>({ ...initialListState, sortDir: 'desc' });
  const [participant, setParticipant] = useState<ParticipantRef | null>(null);
  const [category, setCategory] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [newOpen, setNewOpen] = useState(false);
  const [viewId, setViewId] = useState<string | null>(null);

  const params = qs({
    page: listState.page,
    pageSize: listState.pageSize,
    sortBy: listState.sortBy,
    sortDir: listState.sortDir,
    participantProfileId: participant?.id,
    category,
    from,
    to,
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ['case-management', 'case-notes', params],
    queryFn: () => api.get<Paged<CaseNoteRow>>(`/case-notes${params}`),
  });

  const columns: Column<CaseNoteRow>[] = [
    {
      key: 'noteDate',
      header: 'Date',
      sortKey: 'noteDate',
      render: (n) => formatDate(n.noteDate),
      className: 'whitespace-nowrap',
    },
    {
      key: 'participant',
      header: 'Participant',
      render: (n) =>
        n.participantName ?? <span className="text-muted-foreground">—</span>,
    },
    {
      key: 'category',
      header: 'Category',
      sortKey: 'category',
      render: (n) => <Badge variant="outline">{humanize(n.category)}</Badge>,
    },
    {
      key: 'contactType',
      header: 'Contact',
      sortKey: 'contactType',
      render: (n) => (n.contactType ? humanize(n.contactType) : '—'),
    },
    {
      key: 'content',
      header: 'Note',
      className: 'max-w-md',
      render: (n) =>
        isConfidentialStub(n) ? (
          <span className="inline-flex items-center gap-1.5 italic text-muted-foreground">
            <Lock className="h-3.5 w-3.5" /> Confidential note
          </span>
        ) : (
          <span className="line-clamp-2 inline-flex items-start gap-1.5">
            {n.confidential ? <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : null}
            {n.content}
          </span>
        ),
    },
    { key: 'author', header: 'Author', render: (n) => n.caseManagerName },
    {
      key: 'followUp',
      header: 'Follow-up',
      render: (n) =>
        n.followUpRequired ? (
          n.followUpDoneAt ? (
            <Badge variant="success">Done</Badge>
          ) : (
            <Badge variant="warning">{formatDate(n.followUpDate)}</Badge>
          )
        ) : (
          '—'
        ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Case Notes</h2>
        {can('case_management.create') ? (
          <Button onClick={() => setNewOpen(true)}>
            <Plus className="h-4 w-4" /> New note
          </Button>
        ) : null}
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <ParticipantPicker
          value={participant}
          onChange={(p) => {
            setParticipant(p);
            setListState((s) => ({ ...s, page: 1 }));
          }}
          placeholder="Filter by participant…"
        />
        <Select
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            setListState((s) => ({ ...s, page: 1 }));
          }}
        >
          <option value="">All categories</option>
          {NOTE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {humanize(c)}
            </option>
          ))}
        </Select>
        <Input
          type="date"
          value={from}
          onChange={(e) => {
            setFrom(e.target.value);
            setListState((s) => ({ ...s, page: 1 }));
          }}
          aria-label="From date"
        />
        <Input
          type="date"
          value={to}
          onChange={(e) => {
            setTo(e.target.value);
            setListState((s) => ({ ...s, page: 1 }));
          }}
          aria-label="To date"
        />
      </div>

      {error ? <ErrorState error={error} /> : null}
      <DataTable
        columns={columns}
        data={data}
        isLoading={isLoading}
        state={listState}
        onStateChange={setListState}
        onRowClick={(n) => setViewId(n.id)}
        emptyMessage="No case notes match the current filters"
      />

      {newOpen ? (
        <NewNoteDialog open={newOpen} onOpenChange={setNewOpen} initialParticipant={participant} />
      ) : null}
      <NoteViewDialog noteId={viewId} onClose={() => setViewId(null)} />
    </div>
  );
}
