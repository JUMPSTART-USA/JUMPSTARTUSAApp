import type { PermissionKey, RoleKey } from '@jumpstart/shared';
import type { Request } from 'express';

/** Attached to the request by SessionAuthGuard after loading from the DB. */
export interface AuthenticatedUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  roles: RoleKey[];
  permissions: Set<string>;
  personId: string | null;
  /** Chapter scope (§7.2): a state code, or null when the user sees all chapters. */
  chapter: string | null;
}

export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}

declare module 'express-session' {
  interface SessionData {
    userId?: string;
    /** Set once TOTP verification passed (when the account requires it). */
    totpVerified?: boolean;
  }
}

export function hasPerm(user: AuthenticatedUser, key: PermissionKey): boolean {
  return user.permissions.has(key);
}
