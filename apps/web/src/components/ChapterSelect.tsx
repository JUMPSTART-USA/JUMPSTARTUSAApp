import { CHAPTER_NAMES, CHAPTER_STATES } from '@jumpstart/shared';
import { forwardRef } from 'react';
import type { FieldError } from 'react-hook-form';
import { FormField } from '@/components/FormField';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/input';
import { SelectMenu } from '@/components/ui/select-menu';
import { useAuth } from '@/lib/auth';
import { useChapterScope } from '@/lib/chapter-scope';

/**
 * The inert chip a chapter-scoped session sees where all-chapters users get the
 * chapter filter. For years that slot was simply EMPTY for scoped users, which
 * is most of what the audit meant by "chapter scoping is invisible": the only
 * always-on chapter name was an 11px sidebar line, invisible below lg and
 * nowhere near the lists whose empty results it explains.
 *
 * Static text, no interaction, built from the session before any query runs —
 * so it renders identically whether cross-chapter records exist or not (§7.2;
 * see lib/chapter-scope.ts). The title says "Viewing", not "your account":
 * a session can be narrowed by an admin's chapter PREVIEW, and "your account
 * views South Carolina" would be false for them.
 */
export function ChapterScopeBadge() {
  const { name } = useChapterScope();
  if (!name) return null;
  return (
    <Badge variant="gold" title={`Viewing the ${name} chapter`}>
      {name} chapter
    </Badge>
  );
}

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
 * Chapter filter for list toolbars. All-chapters users get "All chapters" +
 * the six states; chapter-scoped users get the ChapterScopeBadge in the same
 * slot (the API force-filters them, so a live control would be dead weight —
 * but an EMPTY slot read as "this list is the whole org", which it is not).
 * Controlled: pass `value` + `onChange`.
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
  if (user?.chapter) return <ChapterScopeBadge />;
  // SelectMenu, not a native <select>: a toolbar parked under the sticky header
  // sits near the top of the window, where a macOS popup anchored to the
  // selected row opens off-screen (see components/ui/select-menu.tsx).
  return (
    <SelectMenu
      aria-label={label}
      value={value}
      onChange={onChange}
      className={className}
      options={[
        { value: '', label: 'All chapters' },
        ...CHAPTER_STATES.map((s) => ({ value: s, label: CHAPTER_NAMES[s] })),
      ]}
    />
  );
}
