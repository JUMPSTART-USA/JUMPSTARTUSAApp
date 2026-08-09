import { z } from 'zod';
import { CHAPTER_STATES } from '../chapters';
import { ROLE_KEYS } from '../permissions';
import { requiredTrimmed, uuid } from './common';

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1, 'Password is required').max(200),
  totpCode: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Enter the 6-digit code')
    .optional(),
});
export type LoginInput = z.infer<typeof loginSchema>;

/**
 * Password policy: 12+ chars. Length beats composition rules (NIST 800-63B);
 * the API also rejects passwords found in its deny-list of common passwords.
 */
export const passwordSchema = z
  .string()
  .min(12, 'Password must be at least 12 characters')
  .max(200);

export const createUserSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  firstName: requiredTrimmed.pipe(z.string().max(100)),
  lastName: requiredTrimmed.pipe(z.string().max(100)),
  roles: z.array(z.enum(ROLE_KEYS)).min(1, 'Assign at least one role'),
  personId: uuid.optional(),
  // Chapter scope (§7.2): null/omitted = all chapters. Rejected for admins —
  // administrators are always all-chapters (docs/chapter-scoping.md).
  chapter: z.enum(CHAPTER_STATES).nullable().optional(),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = createUserSchema.partial().extend({
  status: z.enum(['invited', 'active', 'deactivated']).optional(),
});
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

/** Enumeration-safe: the endpoint answers { ok: true } whether or not the email exists. */
export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const setPasswordSchema = z
  .object({
    token: z.string().min(1),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .superRefine((val, ctx) => {
    if (val.password !== val.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Passwords do not match',
        path: ['confirmPassword'],
      });
    }
  });
export type SetPasswordInput = z.infer<typeof setPasswordSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .superRefine((val, ctx) => {
    if (val.password !== val.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Passwords do not match',
        path: ['confirmPassword'],
      });
    }
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
