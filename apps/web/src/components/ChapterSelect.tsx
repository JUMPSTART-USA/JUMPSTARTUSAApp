import { CHAPTER_NAMES, CHAPTER_STATES } from '@jumpstart/shared';
import { forwardRef } from 'react';
import type { FieldError } from 'react-hook-form';
import { FormField } from '@/components/FormField';
import { Select } from '@/components/ui/input';
import { useAuth } from '@/lib/auth';

/**
 * Chapter picker for create/edit forms (§7.2, docs/chapter-scoping.md).
 *
 * - All-chapters users (chapter === null) get a REQUIRED select over the six
 *   chapter states — they must decide which chapter the record belongs to.
 * - Chapter-scoped users see nothing: the API stamps their chapter
 *   server-side, so a control would be dead weight.
 *
 * Spread a react-hook-form `register('chapterState')` (or the module's field
 * name) into it like any Select.
 */
export const ChapterSelect = forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement> & {
    label?: string;
    error?: FieldError | { message?: string };
    hint?: string;
    /** Render even for chapter-scoped users (rare — e.g. showing a locked value). */
    alwaysVisible?: boolean;
  }
>(function ChapterSelect({ label = 'Chapter', error, hint, alwaysVisible, ...selectProps }, ref) {
  const { user } = useAuth();
  if (!alwaysVisible && user?.chapter) return null;
  return (
    <FormField label={label} required error={error} hint={hint}>
      <Select ref={ref} {...selectProps}>
        <option value="">Select a chapter…</option>
        {CHAPTER_STATES.map((s) => (
          <option key={s} value={s}>
            {CHAPTER_NAMES[s]}
          </option>
        ))}
      </Select>
    </FormField>
  );
});

/**
 * Chapter filter for list toolbars. Hidden for chapter-scoped users (the API
 * force-filters their chapter anyway); all-chapters users get
 * "All chapters" + the six states. Controlled: pass `value` + `onChange`.
 */
export function ChapterFilterSelect({
  value,
  onChange,
  className = 'w-full sm:w-44',
  label = 'Chapter',
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  /** Accessible name — toolbar filters carry no visible <label>. */
  label?: string;
}) {
  const { user } = useAuth();
  if (user?.chapter) return null;
  return (
    <Select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={className}
    >
      <option value="">All chapters</option>
      {CHAPTER_STATES.map((s) => (
        <option key={s} value={s}>
          {CHAPTER_NAMES[s]}
        </option>
      ))}
    </Select>
  );
}
