import { z } from 'zod';

/** Required date that accepts Date or ISO/date string input. */
export const requiredDate = z.coerce.date();

/**
 * Optional date. Plain `z.coerce.date().nullable()` is a footgun —
 * `new Date(null)` is 1970-01-01 — so empty string/null are normalized to
 * undefined before coercion.
 */
export const optionalDate = z.preprocess(
  (v) => (v === '' || v === null || v === undefined ? undefined : v),
  z.coerce.date().optional(),
);

/** Normalizes '' → undefined so optional text inputs don't store empty strings. */
export const optionalTrimmed = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
  z.string().trim().max(10_000).optional(),
);

/**
 * Clearable variants for UPDATE payloads: null means "clear this field",
 * undefined means "no change". (ZodNullable short-circuits before date
 * coercion, so null never reaches `new Date(null)`.)
 */
export const clearableDate = z.preprocess(
  (v) => (v === '' ? undefined : v),
  z.coerce.date().nullable().optional(),
);
export const clearableUuid = z.string().uuid().nullable().optional();
export const clearableTrimmed = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
  z.string().trim().max(10_000).nullable().optional(),
);

export const requiredTrimmed = z.string().trim().min(1, 'Required').max(10_000);

export const optionalEmail = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
  z.string().trim().email('Invalid email address').max(320).optional(),
);

/**
 * US phone, normalized to XXX-XXX-XXXX. Accepts any punctuation/spacing the
 * user types (and an optional leading 1); stores the canonical dashed form.
 */
export const optionalPhone = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
  z
    .string()
    .trim()
    .transform((s, ctx) => {
      const digits = s.replace(/\D/g, '');
      const ten = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
      if (ten.length !== 10) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Enter a 10-digit phone number as XXX-XXX-XXXX',
        });
        return z.NEVER;
      }
      return `${ten.slice(0, 3)}-${ten.slice(3, 6)}-${ten.slice(6)}`;
    })
    .optional(),
);

export const uuid = z.string().uuid();

export const positiveMoney = z.coerce.number().positive('Must be a positive amount');
export const nonNegativeMoney = z.coerce.number().min(0, 'Cannot be negative');

/** Standard list-endpoint query params: pagination + sorting + search. */
export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
  sortBy: z.string().max(64).optional(),
  sortDir: z.enum(['asc', 'desc']).default('asc'),
  search: z.string().trim().max(200).optional(),
});
export type ListQuery = z.infer<typeof listQuerySchema>;

export const dateRangeFilterSchema = z.object({
  from: optionalDate,
  to: optionalDate,
});

export const idParamSchema = z.object({ id: uuid });

/** end >= start when both present — reused across every dated entity. */
export function endNotBeforeStart(
  startKey: string,
  endKey: string,
  message = 'End date cannot be before start date',
) {
  return (val: Record<string, unknown>, ctx: z.RefinementCtx) => {
    const start = val[startKey];
    const end = val[endKey];
    if (start instanceof Date && end instanceof Date && end.getTime() < start.getTime()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message, path: [endKey] });
    }
  };
}
