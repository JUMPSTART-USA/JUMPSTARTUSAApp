import { cloneElement, isValidElement, useId, type ReactNode } from 'react';
import type { FieldError } from 'react-hook-form';
import { Label } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/** Props FormField injects into a single-element child; ignored by ones that don't take them. */
interface ControlProps {
  id?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
  'aria-required'?: boolean;
}

/**
 * Standard labeled form row: label + control + validation message. The Zod
 * resolver surfaces the same messages the API returns — one rule set (§3.1).
 *
 * The label is programmatically tied to the control: it used to be a bare
 * sibling with no htmlFor, so clicking it did not focus the field and
 * assistive tech had to infer the pairing from proximity. A single-element
 * child receives the generated id (keeping its own if it has one), plus
 * aria-describedby pointing at the hint or error text and aria-invalid while
 * the field is in error.
 *
 * Composite children — search-and-pick controls, checkbox groups — cannot be
 * named by one id, so they keep the previous unassociated behaviour rather
 * than getting a label that points at nothing. Those want their own id
 * pass-through or a fieldset/legend.
 */
export function FormField({
  label,
  required,
  error,
  hint,
  children,
  className,
}: {
  label: string;
  required?: boolean;
  error?: FieldError | { message?: string };
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  const fieldId = useId();
  const hintId = `${fieldId}-hint`;
  const errorId = `${fieldId}-error`;
  const message = error?.message;
  // The error replaces the hint visually, so describe whichever is showing.
  const describedBy = message ? errorId : hint ? hintId : undefined;

  const single = isValidElement<ControlProps>(children) ? children : null;
  const controlId = single ? (single.props.id ?? fieldId) : undefined;
  const control = single
    ? cloneElement(single, {
        id: controlId,
        'aria-describedby': single.props['aria-describedby'] ?? describedBy,
        ...(message ? { 'aria-invalid': true } : {}),
        // The asterisk was the only signal that a field was mandatory, so
        // assistive tech never learned it. aria-required carries it properly,
        // which lets the visual marker be hidden from the accessibility tree
        // instead of being announced as "star".
        ...(required ? { 'aria-required': true } : {}),
      })
    : children;

  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={controlId}>
        {label}
        {required ? (
          <span aria-hidden="true" className="ml-0.5 text-destructive">
            *
          </span>
        ) : null}
      </Label>
      {control}
      {hint && !message ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {message ? (
        <p id={errorId} className="text-xs text-destructive">
          {message}
        </p>
      ) : null}
    </div>
  );
}
