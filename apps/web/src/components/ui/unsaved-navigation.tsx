import { useCallback, useRef, type ReactNode } from 'react';
import { useBlocker } from 'react-router-dom';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useTouchedDirtyState } from '@/components/ui/unsaved-changes';

/**
 * Unsaved-changes protection for FULL-PAGE forms.
 *
 * Dialogs are covered by DialogContent, which has a dismissal to intercept. A
 * page has none: the participant create form is 59 fields, and a click on the
 * sidebar — or a Back gesture — replaced it with another screen and took
 * everything with it, silently. This is the other half of the audit's
 * most-agreed finding (WCAG 3.3.4).
 *
 * Three things worth knowing before changing this:
 *
 * 1. It needs a DATA router. `useBlocker` throws under <BrowserRouter>, which is
 *    why main.tsx mounts createBrowserRouter. It only sees navigations that go
 *    through the router; a full document load (the 401 hard-redirect in api.ts,
 *    a closed tab) is caught instead by beforeunload, armed via the dirty
 *    registration in unsaved-changes.tsx.
 *
 * 2. `allowNavigation()` is imperative and ref-based ON PURPOSE. A form
 *    navigates on its own after a successful save, and by then it is still
 *    dirty. Clearing the dirty flag with state instead would not work: React has
 *    not re-rendered by the time navigate() runs on the next line, so the
 *    blocker would still be holding the old value and would prompt the user to
 *    discard the record they just created.
 *
 * 3. The dirty signal is the same `touched && (explicit ?? true)` pair the
 *    dialogs use, for the same reason — react-hook-form reports isDirty === true
 *    on some forms before anything is typed, so it may only ever clear the flag.
 *    Spread `formProps` onto the <form> to supply the touched half.
 */
export function useUnsavedNavigationGuard(explicitDirty?: boolean): {
  /** Spread onto the page's <form> element — this is the "touched" signal. */
  formProps: { onInput: () => void; onChange: () => void };
  /** Call synchronously before a navigation the form itself intends. */
  allowNavigation: () => void;
  /** Render this inside the page. */
  prompt: ReactNode;
} {
  const { isDirty, markTouched } = useTouchedDirtyState(explicitDirty);
  const allowedRef = useRef(false);

  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    if (allowedRef.current || !isDirty) return false;
    // Changing a query string is filtering or switching a tab, not leaving.
    return currentLocation.pathname !== nextLocation.pathname;
  });

  const allowNavigation = useCallback(() => {
    allowedRef.current = true;
  }, []);

  const prompt = (
    <ConfirmDialog
      open={blocker.state === 'blocked'}
      // Escape and outside-click land here, and mean "keep editing" — the safe
      // reading of an ambiguous gesture, since the ambiguous gesture is what
      // destroyed the work in the first place.
      onOpenChange={(open) => {
        if (!open) blocker.reset?.();
      }}
      title="Leave without saving?"
      description="What you entered on this page has not been saved yet. Leaving now discards it."
      confirmLabel="Leave and discard"
      cancelLabel="Keep editing"
      onConfirm={() => blocker.proceed?.()}
    />
  );

  return { formProps: { onInput: markTouched, onChange: markTouched }, allowNavigation, prompt };
}
