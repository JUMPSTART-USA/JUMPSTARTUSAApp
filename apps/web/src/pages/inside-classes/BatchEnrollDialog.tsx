import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { useState } from 'react';
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
import { Checkbox, Input } from '@/components/ui/input';
import { FormError, Notice } from '@/components/ui/notice';
import { Spinner } from '@/components/ui/spinner';
import { api, ApiError, qs, type Paged } from '@/lib/api';
import { useDebounced } from '@/lib/form';
import { fullName } from '@/lib/utils';
import type { ParticipantPickerItem, RosterEnrollment } from './types';

interface BatchEnrollResult {
  enrolled: unknown[];
  skippedParticipantProfileIds: string[];
}

function pickerLabel(p: ParticipantPickerItem): string {
  const number = p.participantNumber ? ` · ${p.participantNumber}` : '';
  return `${fullName(p.person)}${number}`;
}

export function BatchEnrollDialog({
  open,
  onOpenChange,
  classId,
  roster,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classId: string;
  roster: RosterEnrollment[];
}) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [enrollmentDate, setEnrollmentDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  // id → display label; kept so skipped ids can be shown by name after submit.
  const [selected, setSelected] = useState<Map<string, string>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [skipped, setSkipped] = useState<string[] | null>(null);
  const [enrolledCount, setEnrolledCount] = useState(0);
  const debouncedSearch = useDebounced(search);

  const alreadyEnrolled = new Set(roster.map((e) => e.participantProfileId));

  const participantsQuery = useQuery({
    queryKey: ['inside-classes', 'participant-picker', debouncedSearch],
    queryFn: () =>
      api.get<Paged<ParticipantPickerItem>>(
        `/participants${qs({ search: debouncedSearch, pageSize: 20 })}`,
      ),
    enabled: open,
    placeholderData: keepPreviousData,
  });

  const resetAndClose = (nextOpen: boolean) => {
    if (!nextOpen) {
      setSearch('');
      setSelected(new Map());
      setError(null);
      setSkipped(null);
      setEnrolledCount(0);
    }
    onOpenChange(nextOpen);
  };

  const toggle = (p: ParticipantPickerItem) => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(p.id)) next.delete(p.id);
      else next.set(p.id, pickerLabel(p));
      return next;
    });
  };

  const mutation = useMutation({
    mutationFn: () =>
      api.post<BatchEnrollResult>(`/inside-classes/${classId}/enrollments/batch`, {
        insideClassId: classId,
        participantProfileIds: [...selected.keys()],
        enrollmentDate,
      }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['inside-classes'] });
      if (result.skippedParticipantProfileIds.length > 0) {
        // §6.2: skipped (already-enrolled) participants must be surfaced, never swallowed.
        setEnrolledCount(result.enrolled.length);
        setSkipped(result.skippedParticipantProfileIds);
      } else {
        resetAndClose(false);
      }
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : 'Batch enrollment failed');
    },
  });

  const selectedLabels = selected.size > 0 ? [...selected.entries()] : [];

  return (
    <Dialog open={open} onOpenChange={resetAndClose}>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>Batch enroll participants</DialogTitle>
          <DialogDescription>
            Search participants, select the roster, and enroll them all with one enrollment date.
          </DialogDescription>
        </DialogHeader>

        {skipped ? (
          <div className="space-y-4">
            <p className="text-sm">
              {enrolledCount} participant{enrolledCount === 1 ? '' : 's'} enrolled.
            </p>
            <Notice
              variant="warning"
              title={`${skipped.length} participant${
                skipped.length === 1 ? ' was' : 's were'
              } skipped — already enrolled in this class:`}
            >
              <ul>
                {skipped.map((id) => (
                  <li key={id}>{selected.get(id) ?? id}</li>
                ))}
              </ul>
            </Notice>
            <DialogFooter>
              <Button onClick={() => resetAndClose(false)}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Enrollment date" required>
                <Input
                  type="date"
                  value={enrollmentDate}
                  onChange={(e) => setEnrollmentDate(e.target.value)}
                />
              </FormField>
              <FormField label="Search participants">
                <Input
                  placeholder="Name, number, phone, email…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </FormField>
            </div>

            <div className="max-h-64 overflow-y-auto rounded-md border">
              {participantsQuery.isLoading ? (
                <div className="flex h-24 items-center justify-center">
                  <Spinner />
                </div>
              ) : !participantsQuery.data || participantsQuery.data.items.length === 0 ? (
                <p className="p-4 text-center text-sm text-muted-foreground">
                  No participants match
                </p>
              ) : (
                <ul className="divide-y">
                  {participantsQuery.data.items.map((p) => {
                    const onRoster = alreadyEnrolled.has(p.id);
                    return (
                      <li key={p.id}>
                        <label
                          className={`flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-accent ${
                            onRoster ? 'opacity-50' : ''
                          }`}
                        >
                          <Checkbox
                            checked={selected.has(p.id)}
                            disabled={onRoster}
                            onChange={() => toggle(p)}
                          />
                          <span>{pickerLabel(p)}</span>
                          {onRoster ? (
                            <span className="ml-auto text-xs text-muted-foreground">
                              Already enrolled
                            </span>
                          ) : null}
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {selectedLabels.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {selectedLabels.map(([id, label]) => (
                  <span
                    key={id}
                    className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-0.5 text-xs"
                  >
                    {label}
                    <button
                      type="button"
                      onClick={() =>
                        setSelected((prev) => {
                          const next = new Map(prev);
                          next.delete(id);
                          return next;
                        })
                      }
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            ) : null}

            <FormError message={error} />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => resetAndClose(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  setError(null);
                  mutation.mutate();
                }}
                disabled={selected.size === 0 || !enrollmentDate || mutation.isPending}
              >
                {mutation.isPending
                  ? 'Enrolling…'
                  : `Enroll ${selected.size || ''} participant${selected.size === 1 ? '' : 's'}`}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
