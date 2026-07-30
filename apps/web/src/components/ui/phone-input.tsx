import { forwardRef, type InputHTMLAttributes } from 'react';
import { Input } from '@/components/ui/input';

/**
 * US phone input, auto-formatting to XXX-XXX-XXXX as the user types.
 * Pairs with the shared optionalPhone schema, which normalizes/validates the
 * same format server-side. Works with react-hook-form register spread.
 */
export const PhoneInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ onChange, ...props }, ref) => (
    <Input
      ref={ref}
      type="tel"
      inputMode="numeric"
      autoComplete="tel"
      placeholder="XXX-XXX-XXXX"
      maxLength={12}
      onChange={(e) => {
        const digits = e.target.value.replace(/\D/g, '').slice(0, 10);
        e.target.value =
          digits.length > 6
            ? `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`
            : digits.length > 3
              ? `${digits.slice(0, 3)}-${digits.slice(3)}`
              : digits;
        onChange?.(e);
      }}
      {...props}
    />
  ),
);
PhoneInput.displayName = 'PhoneInput';
