import type { AuditAction, RoleKey, UserStatus } from '@jumpstart/shared';

// Mirrors of the admin API response shapes (apps/api/src/modules/admin/*).

export interface AdminUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  status: UserStatus;
  personId: string | null;
  totpEnabled: boolean;
  passkeyCount: number;
  /** Set = sign-in is suspended. Orthogonal to status: a suspended account
   *  keeps its status, roles and assignments. */
  signInSuspendedAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
  roles: RoleKey[];
  /** Chapter scope: a state code, or null for all chapters. */
  chapter: string | null;
}

export interface InviteResult {
  user: AdminUser;
  /**
   * Single-use invitation link, shown ONCE. Only its hash is stored, so this
   * is the only moment it exists — there is no way to look it up later, and
   * re-inviting mints a new one (which kills this).
   */
  inviteUrl: string;
  emailSent: boolean;
  emailFrom: string | null;
}

export interface EmailConfig {
  configured: boolean;
  fromAddress: string;
  settingKey: string;
  envVars: string[];
}

export interface DeactivateResult {
  ok: boolean;
  sessionsRevoked: number;
  participantsReassigned: number;
  tasksReassigned: number;
}

export interface RoleView {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissionKeys: string[];
  userCount: number;
}

export interface AuditLogEntry {
  id: string;
  userId: string | null;
  action: AuditAction;
  entityType: string;
  entityId: string | null;
  oldValues: unknown;
  newValues: unknown;
  metadata: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt: string;
  user: { firstName: string; lastName: string; email: string } | null;
}

export interface AppSetting {
  id?: string;
  key: string;
  value: unknown;
  createdAt?: string;
  updatedAt?: string;
}

export interface TemplateItem {
  id: string;
  templateId: string;
  label: string;
  sortOrder: number;
  required: boolean;
}

export interface TemplateRecord {
  id: string;
  name: string;
  isDefault: boolean;
  active: boolean;
  items: TemplateItem[];
  _count: { checklists?: number; screenings?: number };
  createdAt?: string;
  updatedAt?: string;
}
