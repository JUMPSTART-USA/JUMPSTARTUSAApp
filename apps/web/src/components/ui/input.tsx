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

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn(controlClasses, 'h-9 px-3 py-1', className)} {...props} />
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
