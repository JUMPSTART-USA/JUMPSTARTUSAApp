import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { useState, type ComponentPropsWithoutRef, type HTMLAttributes } from 'react';
import { Button } from '@/components/ui/button';
import { useTouchedDirtyState } from '@/components/ui/unsaved-changes';
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

/**
 * `guardUnsaved={false}` opts out of the discard confirmation — for read-only
 * detail panels, where there is nothing to lose and a prompt is only in the way.
 */
export function DialogContent({
  className,
  children,
  size = 'md',
  guardUnsaved = true,
  unsavedChanges,
  onEscapeKeyDown,
  onInteractOutside,
  ...props
}: ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
  size?: DialogSize;
  guardUnsaved?: boolean;
  /**
   * Authoritative dirty state, normally `form.formState.isDirty`. Omit it and the
   * dialog falls back to watching for trusted edits inside itself.
   */
  unsavedChanges?: boolean;
}) {
  const { isDirty, markTouched, reset } = useTouchedDirtyState(unsavedChanges);
  const [confirming, setConfirming] = useState(false);
  const guard = guardUnsaved && isDirty;

  /**
   * Escape and backdrop clicks used to discard everything typed, silently. They
   * are intercepted while the form is dirty and answered in place — a nested
   * Radix modal inside a modal fights over focus, so the confirmation renders
   * within this dialog instead.
   *
   * Cancel and the X are deliberately NOT guarded: those are unambiguous "I mean
   * to close this" actions. This protects against the accidents.
   */
  const intercept = (e: Event) => {
    if (!guard) return;
    e.preventDefault();
    setConfirming(true);
  };

  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-navy-ink/60 backdrop-blur-[2px] data-[state=open]:animate-fade-in" />
      <DialogPrimitive.Content
        onInput={markTouched}
        onChange={markTouched}
        /* Reflects the resolved dirty state so the guard is observable from the
           DOM — useful when checking that a dialog is actually protected. */
        data-unsaved={isDirty ? 'true' : 'false'}
        onEscapeKeyDown={(e) => {
          onEscapeKeyDown?.(e);
          if (!e.defaultPrevented) intercept(e);
        }}
        onInteractOutside={(e) => {
          onInteractOutside?.(e);
          if (!e.defaultPrevented) intercept(e);
        }}
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

        {confirming ? (
          <div
            role="alertdialog"
            aria-label="Discard changes?"
            className="absolute inset-0 z-10 flex items-center justify-center rounded-t-xl bg-card/95 p-6 backdrop-blur-sm sm:rounded-xl"
          >
            <div className="max-w-sm space-y-3 text-center">
              <p className="font-medium text-foreground">Discard your changes?</p>
              <p className="text-sm text-muted-foreground">
                What you entered here has not been saved yet.
              </p>
              <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-center">
                <Button variant="outline" autoFocus onClick={() => setConfirming(false)}>
                  Keep editing
                </Button>
                <DialogPrimitive.Close asChild>
                  <Button
                    variant="destructive"
                    onClick={() => {
                      setConfirming(false);
                      reset();
                    }}
                  >
                    Discard
                  </Button>
                </DialogPrimitive.Close>
              </div>
            </div>
          </div>
        ) : null}
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
