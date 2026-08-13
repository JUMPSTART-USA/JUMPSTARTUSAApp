import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock, Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { backTo } from '@/components/BackLink';
import { EditNoteDialog } from './edit-dialogs';
import {
  caseNoteSchema,
  CHAPTER_STATES,
  CONTACT_TYPES,
  NOTE_CATEGORIES,
  type ContactType,
  type NoteCategory,
} from '@jumpstart/shared';
import { ChapterFilterSelect } from '@/components/ChapterSelect';
import { DataTable, type Column } from '@/components/DataTable';
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
import { FilterSelect } from '@/components/ui/filter-select';
import { Checkbox, Input, Label, Select, Textarea } from '@/components/ui/input';
import { FormError } from '@/components/ui/notice';
import { SectionHeader } from '@/components/ui/page-header';
import { ListToolbar } from '@/components/ui/toolbar';
import { ErrorState, Spinner } from '@/components/ui/spinner';
import { ParticipantPicker, useParticipantOption, type PickerOption } from '@/components/pickers';
import { api, qs, type Paged } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { applyApiError, formResolver, todayInput } from '@/lib/form';
import { P, useListParams } from '@/lib/list-params';
import { formatDate, humanize } from '@/lib/utils';
import { isConfidentialStub, type CaseNoteRow } from './shared';

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
  initialParticipant: PickerOption | null;
}) {
  const queryClient = useQueryClient();
  const [participant, setParticipant] = useState<PickerOption | null>(initialParticipant);
  const [topError, setTopError] = useState<string | null>(null);

  const form = useForm<NoteFormValues>({
    resolver: formResolver<NoteFormValues>(caseNoteSchema),
    defaultValues: {
      participantProfileId: initialParticipant?.id ?? '',
      noteDate: todayInput(),
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
    onError: (err) => setTopError(applyApiError(err, setError)),
  });

  const openChange = (next: boolean) => {
    if (next) {
      const last = readLastUsed();
      setParticipant(initialParticipant);
      setTopError(null);
      reset({
        participantProfileId: initialParticipant?.id ?? '',
        noteDate: todayInput(),
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
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>New case note</DialogTitle>
          <DialogDescription>Log a contact with a participant.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={handleSubmit((values) => {
            setTopError(null);
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
              onChange={(p) => {
                setParticipant(p);
                setValue('participantProfileId', p?.id ?? '', { shouldValidate: !!p });
              }}
            />
          </FormField>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <FormField label="Date" required error={formState.errors.noteDate}>
              <Input type="date" max={todayInput()} {...register('noteDate')} />
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

/** Full-note reader — fetches by id so confidential reads are audit-logged. */
function NoteViewDialog({ noteId, onClose }: { noteId: string | null; onClose: () => void }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['case-management', 'case-note', noteId],
    queryFn: () => api.get<CaseNoteRow>(`/case-notes/${noteId}`),
    enabled: !!noteId,
  });

  return (
    <Dialog open={!!noteId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="lg">
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
  const { values, set, listState, onListStateChange } = useListParams(
    {
      participantId: P.id(),
      category: P.choice(NOTE_CATEGORIES, ''),
      state: P.choice(CHAPTER_STATES, ''),
      from: P.date(),
      to: P.date(),
    },
    { sort: { dir: 'desc' } },
  );
  /** The URL carries the id; this turns it back into the name on the chip. */
  const participant = useParticipantOption(values.participantId);
  const [newOpen, setNewOpen] = useState(false);
  const [viewId, setViewId] = useState<string | null>(null);
  const [editNote, setEditNote] = useState<CaseNoteRow | null>(null);
  const canEdit = can('case_management.update');
  const canOpenParticipant = can('participants.read');

  const params = qs({
    page: listState.page,
    pageSize: listState.pageSize,
    sortBy: listState.sortBy,
    sortDir: listState.sortDir,
    // The URL value, not the resolved option: the list must filter on what the
    // link asked for while the name is still loading.
    participantProfileId: values.participantId,
    category: values.category,
    state: values.state,
    from: values.from,
    to: values.to,
  });

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ['case-management', 'case-notes', params],
    queryFn: () => api.get<Paged<CaseNoteRow>>(`/case-notes${params}`),
    // Rows stay put through a page or filter change; DataTable dims them.
    placeholderData: keepPreviousData,
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
        n.participantProfileId && n.participantName && canOpenParticipant ? (
          <Link
            to={`/participants/${n.participantProfileId}`}
            {...backTo('/case-management/notes', 'Case Notes')}
            className="font-medium text-primary hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {n.participantName}
          </Link>
        ) : (
          (n.participantName ?? <span className="text-muted-foreground">—</span>)
        ),
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
    {
      // Always present, unlike the Edit column below which is gated on canEdit:
      // the row click was the only opener for the note detail, so a read-only
      // user with a keyboard could not read a case note at all.
      key: 'view',
      header: '',
      className: 'w-16 text-right',
      render: (n) => (
        <Button
          variant="ghost"
          size="sm"
          aria-label={`View case note${n.participantName ? ` for ${n.participantName}` : ''} from ${formatDate(n.noteDate)}`}
          onClick={(e) => {
            e.stopPropagation();
            setViewId(n.id);
          }}
        >
          View
        </Button>
      ),
    },
    ...(canEdit
      ? [
          {
            key: 'actions',
            header: '',
            className: 'w-10',
            render: (n: CaseNoteRow) =>
              isConfidentialStub(n) ? null : (
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="Edit note"
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditNote(n);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              ),
          } satisfies Column<CaseNoteRow>,
        ]
      : []),
  ];

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Case Notes"
        actions={
          can('case_management.create') ? (
            <Button onClick={() => setNewOpen(true)}>
              <Plus className="h-4 w-4" /> New note
            </Button>
          ) : null
        }
      />

      {/* Every filter below used to carry its own `page: 1` reset. `set` deletes
          the page key in the SAME URL write, so they no longer need one. */}
      <ListToolbar>
        <div className="w-full sm:w-72">
          <ParticipantPicker
            {...participant}
            onChange={(p) => set('participantId', p?.id ?? '')}
          />
        </div>
        <FilterSelect
          aria-label="Category"
          className="w-full sm:w-44"
          value={values.category}
          onChange={(value) => set('category', value as (typeof NOTE_CATEGORIES)[number] | '')}
        >
          <option value="">All categories</option>
          {NOTE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {humanize(c)}
            </option>
          ))}
        </FilterSelect>
        {/* Chapter scoping (§7.2): notes derive their chapter from the
            participant — hidden for scoped users, whom the API force-filters. */}
        <ChapterFilterSelect
          value={values.state}
          onChange={(v) => set('state', v as (typeof CHAPTER_STATES)[number] | '')}
        />
        <Input
          type="date"
          className="w-full sm:w-44"
          value={values.from}
          onChange={(e) => set('from', e.target.value)}
          aria-label="From date"
        />
        <Input
          type="date"
          className="w-full sm:w-44"
          value={values.to}
          onChange={(e) => set('to', e.target.value)}
          aria-label="To date"
        />
      </ListToolbar>

      {error ? <ErrorState error={error} /> : null}
      <DataTable
        columns={columns}
        data={data}
        isLoading={isLoading}
        isFetching={isFetching}
        state={listState}
        onStateChange={onListStateChange}
        onRowClick={(n) => setViewId(n.id)}
        emptyMessage="No case notes match the current filters"
      />

      {newOpen ? (
        <NewNoteDialog
          open={newOpen}
          onOpenChange={setNewOpen}
          initialParticipant={participant.value}
        />
      ) : null}
      <NoteViewDialog noteId={viewId} onClose={() => setViewId(null)} />
      <EditNoteDialog note={editNote} onClose={() => setEditNote(null)} />
    </div>
  );
}
