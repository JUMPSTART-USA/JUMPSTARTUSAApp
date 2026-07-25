import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ApiError, api, qs, type Paged } from '@/lib/api';
import { humanize } from '@/lib/utils';

/** Small debounce for search inputs so typing doesn't spam the list endpoint. */
export function useDebounced<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

/** Map an ApiError into the form: field errors by path, otherwise a top-level message. */
export function applyApiError<T extends FieldValues>(
  err: unknown,
  setError: UseFormSetError<T>,
  setTopLevel: (msg: string) => void,
) {
  if (err instanceof ApiError) {
    if (err.errors?.length) {
      for (const fieldError of err.errors) {
        setError(fieldError.path as Path<T>, { type: 'server', message: fieldError.message });
      }
      return;
    }
    setTopLevel(err.message);
    return;
  }
  setTopLevel('Request failed — try again');
}

/** ISO datetime string → value for an <input type="date">. */
export function toDateInput(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : '';
}

const HIRING_VARIANTS: Record<string, BadgeProps['variant']> = {
  prospect: 'secondary',
  partner: 'info',
  actively_hiring: 'success',
  paused: 'warning',
  inactive: 'outline',
};

export function HiringStatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) return <span className="text-muted-foreground">—</span>;
  return <Badge variant={HIRING_VARIANTS[status] ?? 'secondary'}>{humanize(status)}</Badge>;
}

const EMPLOYMENT_VARIANTS: Record<string, BadgeProps['variant']> = {
  applied: 'secondary',
  interviewing: 'info',
  hired: 'success',
  active: 'success',
  terminated: 'destructive',
  resigned: 'warning',
  completed: 'info',
  unknown: 'outline',
};

export function EmploymentStatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) return <span className="text-muted-foreground">—</span>;
  return <Badge variant={EMPLOYMENT_VARIANTS[status] ?? 'secondary'}>{humanize(status)}</Badge>;
}

export const PAY_SUFFIX: Record<string, string> = {
  hourly: '/hr',
  weekly: '/wk',
  annual: '/yr',
};

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  pending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  pending: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" disabled={pending} onClick={onConfirm}>
            {pending ? 'Working…' : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export interface PickerSelection {
  id: string;
  label: string;
}

interface ParticipantHit {
  id: string;
  participantNumber: string;
  person: { firstName: string; lastName: string };
}

/** Search-and-pick a participant for the placement form. */
export function ParticipantPicker({
  selection,
  onSelect,
}: {
  selection: PickerSelection | null;
  onSelect: (sel: PickerSelection | null) => void;
}) {
  const [q, setQ] = useState('');
  const search = useDebounced(q);
  const { data, isFetching } = useQuery({
    queryKey: ['employments', 'participant-picker', search],
    queryFn: () => api.get<Paged<ParticipantHit>>(`/participants${qs({ search, pageSize: 8 })}`),
    enabled: !selection && search.trim().length >= 2,
  });

  if (selection) {
    return (
      <div className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-1.5 text-sm">
        <span>{selection.label}</span>
        <Button variant="ghost" size="sm" onClick={() => onSelect(null)}>
          Change
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <Input
        placeholder="Search participants by name or number…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {search.trim().length >= 2 ? (
        <div className="max-h-44 divide-y overflow-y-auto rounded-md border bg-card">
          {isFetching ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">Searching…</div>
          ) : !data || data.items.length === 0 ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">No matches</div>
          ) : (
            data.items.map((p) => (
              <button
                key={p.id}
                type="button"
                className="block w-full px-3 py-2 text-left text-sm hover:bg-accent"
                onClick={() =>
                  onSelect({
                    id: p.id,
                    label: `${p.person.firstName} ${p.person.lastName} · ${p.participantNumber}`,
                  })
                }
              >
                {p.person.firstName} {p.person.lastName}{' '}
                <span className="text-muted-foreground">· {p.participantNumber}</span>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
