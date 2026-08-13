import { Children, isValidElement, useMemo, type ReactNode } from 'react';
import { SelectMenu, type SelectMenuOption } from '@/components/ui/select-menu';
import { nodeText } from '@/lib/utils';

/** Read <option> children (including the arrays .map() produces) into options. */
function optionsFromChildren(children: ReactNode): SelectMenuOption[] {
  const out: SelectMenuOption[] = [];
  Children.toArray(children).forEach((child) => {
    if (!isValidElement<{ value?: string | number; children?: ReactNode }>(child)) return;
    if (child.type === 'option') {
      const label = nodeText(child.props.children);
      out.push({ value: child.props.value !== undefined ? String(child.props.value) : label, label });
    } else if (child.props.children) {
      out.push(...optionsFromChildren(child.props.children));
    }
  });
  return out;
}

/**
 * Page-level filter dropdown: keeps the familiar `<option>` children of a
 * native <select> but renders through SelectMenu, whose menu lives in the page.
 *
 * Native popups on macOS are anchored to the selected row, so a control that
 * ends up near the top of the window — a list toolbar parked under the sticky
 * header, for instance — opens its popup off the top of the screen and strands
 * every option above the selected one. Page-level filters are exposed to that;
 * form fields inside dialogs are not, and keep the native <select> (better on
 * touch, and they sit mid-screen with room both ways).
 *
 * Difference from <Select>: `onChange` hands you the value, not an event.
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
  const options = useMemo(() => optionsFromChildren(children), [children]);
  return (
    <SelectMenu
      value={value}
      options={options}
      onChange={onChange}
      aria-label={ariaLabel}
      className={className}
      dark={dark}
      disabled={disabled}
    />
  );
}

/**
 * The label for an <option> standing in for a filter value the loaded option list
 * does not contain — or null when no stand-in is needed.
 *
 * Returns a LABEL, not an element, and the caller must render the <option>
 * itself as a DIRECT child of FilterSelect. That control reads its children with
 * `child.type === 'option'` (above), so an <option> wrapped in a
 * component of your own is invisible to it: the menu silently omits the value and
 * the button falls back to the first option. Measured — the first version of this
 * was a component and the select still read "All campaigns".
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
