import type { ChapterState, PermissionKey, RoleKey } from '@jumpstart/shared';
import type { Request } from 'express';

/** Attached to the request by SessionAuthGuard after loading from the DB. */
export interface AuthenticatedUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  roles: RoleKey[];
  permissions: Set<string>;
  /** The account's real roles — differs from `roles` only during a "view as role" preview. */
  actualRoles: RoleKey[];
  /** Set while an administrator is previewing the app as another role. */
  viewAsRole: RoleKey | null;
  personId: string | null;
  /** Chapter scope (§7.2): a state code, or null when the user sees all chapters. */
  chapter: string | null;
  /** The account's real default chapter (first scope row), ignoring any preview. */
  actualChapter: string | null;
  /** Chapters the account may view: specific states, or null = all chapters. */
  allowedChapters: string[] | null;
  /** Set while the user is previewing a single chapter. */
  viewChapter: string | null;
}

export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}

declare module 'express-session' {
  interface SessionData {
    userId?: string;
    /** Set once TOTP verification passed (when the account requires it). */
    totpVerified?: boolean;
    /** Admin "view as role" preview — applied by SessionAuthGuard while the account holds admin. */
    viewAsRole?: RoleKey;
    /** Chapter preview — applied by SessionAuthGuard while the account may view that chapter. */
    viewChapter?: ChapterState;
  }
}

export function hasPerm(user: AuthenticatedUser, key: PermissionKey): boolean {
  return user.permissions.has(key);
}
