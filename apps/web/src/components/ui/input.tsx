import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/**
 * `text-base sm:text-sm`: iOS Safari zooms the whole page whenever a focused
 * control computes under 16px, and it does not zoom back out on blur — which
 * pushed a bottom sheet's Save button off screen after tapping any field. 16px
 * below the `sm` breakpoint stops that; desktop keeps 14px.
 *
 * The focus ring is ADDITIVE — it no longer clears the border. Previously
 * `focus-visible:border-transparent` swapped a 1.68:1 border for a 2.32:1 ring,
 * so focusing a field changed almost nothing visible. Both tokens are now above
 * the 3:1 floor and both stay on screen.
 */
const controlClasses =
  'flex w-full rounded-md border border-input bg-card text-base shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm';

/**
 * The on-screen keyboard a field should raise, derived from its `type`.
 *
 * Doing this in the kit rather than at ~354 call sites is the only version that
 * stays true: a convention nobody can forget. A staff member entering a phone
 * number on a phone gets a keypad instead of a QWERTY keyboard, and one entering
 * an amount gets a decimal point, without anyone remembering to ask.
 *
 * `step` decides numeric vs decimal, because "0.01" means money and "1" means a
 * count, and a decimal keypad for a count is a stray dot waiting to happen.
 *
 * DELIBERATELY NOT autoComplete. It is tempting to pair `type="email"` with
 * `autoComplete="email"`, and it would be wrong nearly everywhere here: most
 * fields in this app describe SOMEONE ELSE — a participant's email, a vendor's
 * phone — and the browser would helpfully offer the staff member's own details
 * for a record about a person in their caseload. The auth screens set their own
 * tokens (username / current-password) because those really are about the
 * person typing.
 */
function keyboardFor(props: InputHTMLAttributes<HTMLInputElement>) {
  if (props.inputMode) return props.inputMode;
  switch (props.type) {
    case 'email':
      return 'email';
    case 'tel':
      return 'tel';
    case 'url':
      return 'url';
    case 'number':
      return String(props.step ?? '').includes('.') ? 'decimal' : 'numeric';
    default:
      return undefined;
  }
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(controlClasses, 'h-9 px-3 py-1', className)}
      inputMode={keyboardFor(props)}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(controlClasses, 'min-h-[80px] px-3 py-2', className)}
    {...props}
  />
));
Textarea.displayName = 'Textarea';

export function Label({
  className,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn('text-sm font-medium leading-none text-foreground', className)}
      {...props}
    />
  );
}

/**
 * Native select styled to match — reliable in forms, no portal complexity.
 *
 * `block` deliberately overrides controlClasses' `flex` (twMerge keeps the
 * last display): Safari/WebKit mis-hit-tests a `display: flex` <select>, so
 * the popup only opened from the arrow at the right edge instead of anywhere
 * on the control. It shows up worst on narrow selects whose option text is
 * wider than the box (e.g. "South Carolina" in a 144px chapter field).
 */
export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select ref={ref} className={cn(controlClasses, 'block h-9 px-3 py-1', className)} {...props}>
      {children}
    </select>
  ),
);
Select.displayName = 'Select';

/**
 * Navy-sidebar treatment for a native Select (the drawer's role/chapter
 * switchers). The [&>option] rules matter: option elements inherit the OS
 * default white sheet, so white text on bg-white/10 would vanish without them.
 */
export const DARK_SELECT =
  'border-white/20 bg-white/10 text-white [&>option]:bg-navy-deep [&>option]:text-white';

export const Checkbox = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      type="checkbox"
      className={cn('h-4 w-4 rounded border-input accent-primary', className)}
      {...props}
    />
  ),
);
Checkbox.displayName = 'Checkbox';
