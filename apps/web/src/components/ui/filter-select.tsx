import type { ReactNode } from 'react';
import { DARK_SELECT, Select } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/**
 * Page-level filter dropdown — a native <select> that hands `onChange` the
 * VALUE, not the event (the one difference from <Select>).
 *
 * History, so nobody re-adds the workaround blindly: a macOS beta anchored a
 * native select's popup so the selected row sat over the control, which opened
 * the popup off the top of the screen for controls parked near the viewport
 * top — the header switchers and these toolbar filters. PRs #38/#39 replaced
 * them with an in-page listbox (SelectMenu) to sidestep that. The OS fix
 * shipped, and every menu is back on the native control so all menus in the
 * app look and operate alike (and type-ahead works again).
 */
export function FilterSelect({
  value,
  onChange,
  'aria-label': ariaLabel,
  className,
  dark,
  disabled,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  'aria-label': string;
  className?: string;
  dark?: boolean;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <Select
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(dark && DARK_SELECT, className)}
      disabled={disabled}
    >
      {children}
    </Select>
  );
}

/**
 * The label for an <option> standing in for a filter value the loaded option list
 * does not contain — or null when no stand-in is needed.
 *
 * Why a stand-in is needed at all: filters like these come from the URL, and the
 * option lists behind them are both capped (pageSize: 200) and CHAPTER-SCOPED. A
 * scoped user opening an all-chapters colleague's link gets an id the
 * options query will never return, and a select whose value matches no option
 * renders as its first — so the screen said "All campaigns" while showing one
 * campaign's donations. That is the "filtered list beside an empty box" the entity
 * pickers were kept out of the URL to avoid.
 *
 * ONE message for every cause — another chapter, deleted, past the cap. Naming the
 * cause would make the control an existence oracle for other chapters' records,
 * the §7.2 leak just closed on /budget-items. Clearing the filter instead is not an
 * option either: it would silently widen the results beyond what the link asked for.
 */
export function unresolvedOptionLabel(
  value: string,
  options: { id: string }[] | undefined,
  isLoading: boolean,
): string | null {
  if (!value) return null;
  if (options?.some((o) => o.id === value)) return null;
  return isLoading ? 'Loading…' : "A record you can't view";
}
