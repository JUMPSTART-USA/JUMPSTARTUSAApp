import { useCallback, useEffect, useState } from 'react';

/**
 * Unsaved-changes protection for dialogs.
 *
 * The audit's most-agreed finding, raised independently by three dimension
 * audits: Escape or a backdrop click discarded everything typed into any of ~58
 * forms, with no warning, no draft and no undo. A case manager could lose a
 * 2,000-word contact note by brushing the trackpad.
 *
 * TWO signals, combined — `touched && (explicit ?? true)`:
 *
 * 1. TOUCHED — the dialog listens for React `onInput`/`onChange` bubbling up from
 *    any control inside it. This is what makes a dialog "possibly dirty" at all,
 *    and it needs no per-file wiring, so a dialog nobody migrated is protected.
 *    Via React's event system rather than a ref + addEventListener, because the
 *    ref-attached version silently never bound — measured, not assumed.
 *
 * 2. EXPLICIT (optional) — the component owning the form passes
 *    `unsavedChanges={form.formState.isDirty}`. It cannot make a dialog dirty on
 *    its own; it can only clear it. That is deliberate, because react-hook-form
 *    reports isDirty === true the moment some dialogs OPEN — measured on the New
 *    volunteer dialog, whose defaultValues do not cover every registered field.
 *    Trusting it alone prompted "Discard your changes?" on a dialog where nothing
 *    had been typed. What it adds is revert detection: type a value, delete it
 *    again, and the prompt correctly stays away.
 *
 * It is a PROP, not a context/hook: `useForm` is called in the component that
 * *renders* DialogContent, which puts it ABOVE any provider DialogContent could
 * install, so a context would silently never receive it. (Learned by building it
 * that way first and watching the guard not fire.)
 *
 * Neither signal is trusted alone, because each has a failure mode the other
 * covers: `touched` cannot tell a revert from an edit, and `isDirty` can be true
 * before the user has done anything.
 */

/** Module-level count of dirty forms anywhere, for beforeunload + the deploy watcher. */
let dirtyCount = 0;
const listeners = new Set<() => void>();

function onBeforeUnload(e: BeforeUnloadEvent) {
  e.preventDefault();
  // Legacy trigger; modern browsers supply their own wording.
  e.returnValue = '';
}

function adjustDirty(delta: number) {
  const before = dirtyCount;
  dirtyCount = Math.max(0, dirtyCount + delta);
  if (before === 0 && dirtyCount > 0) window.addEventListener('beforeunload', onBeforeUnload);
  else if (before > 0 && dirtyCount === 0) window.removeEventListener('beforeunload', onBeforeUnload);
  if ((before === 0) !== (dirtyCount === 0)) listeners.forEach((fn) => fn());
}

/** Is anything in the app holding unsaved edits right now? */
export function hasUnsavedWork(): boolean {
  return dirtyCount > 0;
}

/** Subscribe to transitions between "nothing unsaved" and "something unsaved". */
export function subscribeUnsaved(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Resolves whether a dialog is holding unsaved work. See the note above. */
export function useDialogDirtyState(explicit: boolean | undefined) {
  const [touched, setTouched] = useState(false);
  // Something was edited AND, where the form tells us, it still differs from
  // where it started. `explicit` can only ever clear the flag, never raise it.
  const isDirty = touched && (explicit ?? true);

  useEffect(() => {
    if (!isDirty) return;
    adjustDirty(1);
    return () => adjustDirty(-1);
  }, [isDirty]);

  const markTouched = useCallback(() => setTouched(true), []);
  const reset = useCallback(() => setTouched(false), []);

  return { isDirty, markTouched, reset };
}
