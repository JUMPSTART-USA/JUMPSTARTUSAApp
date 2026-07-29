import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ComponentPropsWithoutRef, HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

/** One width scale for every dialog in the app — pick by form density, not per file. */
const DIALOG_SIZES = {
  sm: 'sm:max-w-md',
  md: 'sm:max-w-lg',
  lg: 'sm:max-w-xl',
  xl: 'sm:max-w-2xl',
  '2xl': 'sm:max-w-3xl',
} as const;

export type DialogSize = keyof typeof DIALOG_SIZES;

export function DialogContent({
  className,
  children,
  size = 'md',
  ...props
}: ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { size?: DialogSize }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-navy-ink/60 backdrop-blur-[2px] data-[state=open]:animate-fade-in" />
      <DialogPrimitive.Content
        className={cn(
          // Mobile: bottom sheet. ≥sm: centered modal.
          'fixed inset-x-0 bottom-0 z-50 grid max-h-[90dvh] w-full gap-4 overflow-y-auto rounded-t-xl border bg-card p-4 shadow-overlay data-[state=open]:animate-fade-in',
          'sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:max-h-[85dvh] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl sm:p-6',
          DIALOG_SIZES[size],
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close className="absolute right-4 top-4 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col space-y-1.5 pr-8', className)} {...props} />;
}

export function DialogTitle({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn('font-display text-lg font-semibold leading-none tracking-tight', className)}
      {...props}
    />
  );
}

export function DialogDescription({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  );
}

export function DialogFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end', className)}
      {...props}
    />
  );
}
