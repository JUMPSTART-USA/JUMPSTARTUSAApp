import { Children, isValidElement, useMemo, type ReactNode } from 'react';
import { SelectMenu, type SelectMenuOption } from '@/components/ui/select-menu';

/** Flatten a node tree to its text, so `{humanize(s)}` style labels come through. */
function textOf(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return '';
}

/** Read <option> children (including the arrays .map() produces) into options. */
function optionsFromChildren(children: ReactNode): SelectMenuOption[] {
  const out: SelectMenuOption[] = [];
  Children.toArray(children).forEach((child) => {
    if (!isValidElement<{ value?: string | number; children?: ReactNode }>(child)) return;
    if (child.type === 'option') {
      const label = textOf(child.props.children);
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
