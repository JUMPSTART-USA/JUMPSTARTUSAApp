import type { ReactNode } from 'react';
import type { FieldError } from 'react-hook-form';
import { Label } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/**
 * Standard labeled form row: label + control + validation message. The Zod
 * resolver surfaces the same messages the API returns — one rule set (§3.1).
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
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label>
        {label}
        {required ? <span className="ml-0.5 text-destructive">*</span> : null}
      </Label>
      {children}
      {hint && !error ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      {error?.message ? <p className="text-xs text-destructive">{error.message}</p> : null}
    </div>
  );
}
