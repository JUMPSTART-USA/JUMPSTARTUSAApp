import { AlertTriangle, CheckCircle2, Info, OctagonAlert } from 'lucide-react';
import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

const NOTICE_STYLES = {
  error: { box: 'border-destructive/30 bg-destructive/10 text-destructive', Icon: OctagonAlert },
  warning: { box: 'border-warning/30 bg-warning/10 text-warning', Icon: AlertTriangle },
  success: { box: 'border-success/30 bg-success/10 text-success', Icon: CheckCircle2 },
  info: { box: 'border-info/30 bg-info/10 text-info', Icon: Info },
} as const;

export type NoticeVariant = keyof typeof NOTICE_STYLES;

/**
 * The one inline message box: form errors, warnings, success confirmations,
 * info callouts. Replaces the module-local ErrorNotice / WarningNotice /
 * AmberNotice / FormErrorNotice variants.
 */
export function Notice({
  variant = 'info',
  title,
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & { variant?: NoticeVariant; title?: ReactNode }) {
  const { box, Icon } = NOTICE_STYLES[variant];
  return (
    <div
      /* Errors interrupt (assertive); success/warning/info announce politely.
         Previously only the error variant had any live semantics, so every
         confirmation in the app completed in silence. */
      role={variant === 'error' ? 'alert' : 'status'}
      className={cn('flex gap-2.5 rounded-lg border px-4 py-3 text-sm', box, className)}
      {...props}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 space-y-1">
        {title ? <p className="font-medium">{title}</p> : null}
        {children ? <div className="[&_ul]:list-disc [&_ul]:pl-4">{children}</div> : null}
      </div>
    </div>
  );
}

/** Null-safe top-of-form error — pairs with applyApiError from @/lib/form. */
export function FormError({ message, className }: { message?: string | null; className?: string }) {
  if (!message) return null;
  return (
    <Notice variant="error" className={className}>
      {message}
    </Notice>
  );
}
