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
import { ApiError } from '@/lib/api';
import { humanize } from '@/lib/utils';
import type { AlertSeverity, Vehicle } from './types';

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

export function vehicleLabel(v: Pick<Vehicle, 'year' | 'make' | 'model'>): string {
  return `${v.year} ${v.make} ${v.model}`;
}

const SEVERITY_VARIANTS: Record<AlertSeverity, BadgeProps['variant']> = {
  overdue: 'destructive',
  due_soon: 'warning',
  upcoming: 'secondary',
};

export function SeverityBadge({ severity }: { severity: AlertSeverity }) {
  return <Badge variant={SEVERITY_VARIANTS[severity]}>{humanize(severity)}</Badge>;
}

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
