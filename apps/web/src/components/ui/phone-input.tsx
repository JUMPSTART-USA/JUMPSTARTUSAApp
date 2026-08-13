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
      /**
       * "off", not "tel". Every one of this control's twelve call sites is
       * SOMEONE ELSE's number — a participant's, a vendor's, a house manager's
       * — so `autoComplete="tel"` offered the staff member's own phone number
       * while they typed a record about a person in their caseload, and one
       * absent-minded tap filed it. A field for the signed-in user's own number
       * can pass autoComplete="tel" explicitly.
       */
      autoComplete="off"
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
