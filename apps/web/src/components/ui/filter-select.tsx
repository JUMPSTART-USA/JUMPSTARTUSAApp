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
