import { authenticator } from 'otplib';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { randomBytes } from 'crypto';
import type { Prisma, UserStatus } from '@jumpstart/database';
import type { CreateUserInput, ListQuery, RoleKey, UpdateUserInput } from '@jumpstart/shared';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../../mail/mail.service';

export interface UserListFilters {
  status?: UserStatus;
}

// Whitelist of sortable columns — sortBy comes from the query string and must
// never reach Prisma unchecked.
const SORTABLE = new Set(['email', 'firstName', 'lastName', 'status', 'lastLoginAt', 'createdAt']);

const USER_ROLES_INCLUDE = {
  userRoles: { include: { role: true } },
  regionScopes: true,
} as const;
type UserWithRoles = Prisma.UserGetPayload<{ include: typeof USER_ROLES_INCLUDE }>;

/** Explicit field pick — passwordHash/totpSecret must never leave the API. */
function toSafeUser(user: UserWithRoles) {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    status: user.status,
    personId: user.personId,
    totpEnabled: user.totpEnabled,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    roles: user.userRoles.map((ur) => ur.role.key),
    // One scope row = that chapter; no rows = all chapters (§7.2).
    // Admins are always all-chapters — the guard ignores their scope rows.
    chapter: user.userRoles.some((ur) => ur.role.key === 'admin')
      ? null
      : (user.regionScopes[0]?.state ?? null),
  };
}

@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
      private readonly mail: MailService,
) {}

  async list(query: ListQuery, filters: UserListFilters) {
    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      ...(filters.status ? { status: filters.status } : {}),
      ...(query.search
        ? {
            OR: [
              { email: { contains: query.search, mode: 'insensitive' } },
              { firstName: { contains: query.search, mode: 'insensitive' } },
              { lastName: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const orderBy: Prisma.UserOrderByWithRelationInput =
      query.sortBy && SORTABLE.has(query.sortBy)
        ? { [query.sortBy]: query.sortDir }
        : { lastName: 'asc' };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: USER_ROLES_INCLUDE,
      }),
      this.prisma.user.count({ where }),
    ]);

    return { items: items.map(toSafeUser), total, page: query.page, pageSize: query.pageSize };
  }

  async get(id: string) {
    return toSafeUser(await this.getRaw(id));
  }

  private async getRaw(id: string): Promise<UserWithRoles> {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      include: USER_ROLES_INCLUDE,
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  /**
   * Invite flow within the existing schema (§6.14): the account is created as
   * 'invited' with a server-generated temporary password, returned ONCE in this
   * response for the admin to hand off out-of-band. First successful login
   * flips status to 'active' (AuthService) and the SPA forces a password
   * change. The temporary password is never stored or logged in clear.
   */
  async create(input: CreateUserInput, userId: string) {
    const existing = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (existing) throw new ConflictException('A user with this email already exists');

    const roles = await this.resolveRoles(input.roles);

    // Chapter at invite time (§7.2): admins are always all-chapters.
    if (input.chapter && input.roles.includes('admin')) {
      throw new BadRequestException(
        'Administrators always see all chapters and cannot be chapter-scoped',
      );
    }

    // 12 random bytes → exactly 16 base64url chars, no padding.
    const temporaryPassword = randomBytes(12).toString('base64url');
    const passwordHash = await argon2.hash(temporaryPassword, { type: argon2.argon2id });

    const user = await this.prisma.user.create({
      data: {
        email: input.email,
        firstName: input.firstName,
        lastName: input.lastName,
        personId: input.personId,
        passwordHash,
        status: 'invited',
        createdById: userId,
        updatedById: userId,
        userRoles: { create: roles.map((r) => ({ roleId: r.id })) },
        ...(input.chapter ? { regionScopes: { create: { state: input.chapter } } } : {}),
      },
      include: USER_ROLES_INCLUDE,
    });

    const safe = toSafeUser(user);
    await this.audit.logCreate(userId, 'user', user.id, safe);
    // Invite email (Graph). Unconfigured mail keeps the manual hand-off flow.
    const email = await this.mail.sendInvite(user.email, user.firstName, temporaryPassword);
    return { user: safe, temporaryPassword, emailSent: email.sent, emailFrom: email.from };
  }

  /**
   * Re-issue an invite: only for accounts still in 'invited' status. The old
   * temporary password is unrecoverable by design, so a new one is generated.
   */
  async resendInvite(id: string, userId: string) {
    const existing = await this.getRaw(id);
    if (existing.status !== 'invited') {
      throw new BadRequestException('Only accounts that have never signed in can be re-invited');
    }
    const temporaryPassword = randomBytes(12).toString('base64url');
    const passwordHash = await argon2.hash(temporaryPassword, { type: argon2.argon2id });
    const user = await this.prisma.user.update({
      where: { id },
      data: { passwordHash, updatedById: userId },
      include: USER_ROLES_INCLUDE,
    });
    await this.audit.log({
      userId,
      action: 'update',
      entityType: 'user',
      entityId: id,
      newValues: { resentInvite: true },
    });
    const email = await this.mail.sendInvite(user.email, user.firstName, temporaryPassword);
    return { user: toSafeUser(user), temporaryPassword, emailSent: email.sent, emailFrom: email.from };
  }

  async update(id: string, input: UpdateUserInput, userId: string) {
    const existing = await this.getRaw(id);

    // The §7.6 departure flow (session revocation + caseload handoff) must not
    // be bypassable through a plain status edit.
    if (input.status === 'deactivated') {
      throw new BadRequestException(
        'Use POST /admin/users/:id/deactivate to deactivate an account',
      );
    }

    if (input.email && input.email !== existing.email) {
      const emailTaken = await this.prisma.user.findUnique({ where: { email: input.email } });
      if (emailTaken) throw new ConflictException('A user with this email already exists');
    }

    // `chapter` is a scope, not a user column — pull it out of the row update.
    const { roles: newRoleKeys, chapter, ...userFields } = input;
    const roles = newRoleKeys ? await this.resolveRoles(newRoleKeys) : undefined;

    // Effective admin status after this edit (new roles if changing, else the
    // account's current roles). Admins are always all-chapters (§7.2).
    const willHoldAdmin = roles
      ? roles.some((r) => r.key === 'admin')
      : existing.userRoles.some((ur) => ur.role.key === 'admin');
    if (chapter && willHoldAdmin) {
      throw new BadRequestException(
        'Administrators always see all chapters and cannot be chapter-scoped',
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { ...userFields, updatedById: userId } });
      if (roles) {
        await tx.userRole.deleteMany({ where: { userId: id } });
        await tx.userRole.createMany({ data: roles.map((r) => ({ userId: id, roleId: r.id })) });
      }
      // Apply an explicit chapter change; `undefined` leaves scopes untouched.
      // Granting admin always clears scopes (all-chapters) regardless.
      if (chapter !== undefined || willHoldAdmin) {
        await tx.userRegionScope.deleteMany({ where: { userId: id } });
        if (chapter && !willHoldAdmin) {
          await tx.userRegionScope.create({ data: { userId: id, state: chapter } });
        }
      }
      return tx.user.findUniqueOrThrow({ where: { id }, include: USER_ROLES_INCLUDE });
    });

    const oldSafe = toSafeUser(existing);
    const newSafe = toSafeUser(updated);
    await this.audit.logUpdate(userId, 'user', id, oldSafe, newSafe);

    // Role changes are a security event, audited separately as permission_change
    // with the old/new role keys (§4.1.5).
    if (roles && !sameSet(oldSafe.roles, newSafe.roles)) {
      await this.audit.log({
        userId,
        action: 'permission_change',
        entityType: 'user',
        entityId: id,
        oldValues: { roles: oldSafe.roles },
        newValues: { roles: newSafe.roles },
      });
    }

    return newSafe;
  }

  /**
   * §7.6 departing-staff action, one transaction: deactivate the account,
   * revoke every live session, and hand the open caseload (participants +
   * open tasks) to another staff member.
   */
  async deactivate(id: string, reassignToUserId: string, userId: string) {
    if (id === userId) {
      throw new BadRequestException('You cannot deactivate your own account');
    }
    if (reassignToUserId === id) {
      throw new BadRequestException('Caseload cannot be reassigned to the departing user');
    }

    const existing = await this.getRaw(id);
    if (existing.status === 'deactivated') {
      throw new ConflictException('This account is already deactivated');
    }

    const target = await this.prisma.user.findFirst({
      where: { id: reassignToUserId, deletedAt: null },
    });
    if (!target) throw new NotFoundException('Reassignment target user not found');
    if (target.status !== 'active') {
      throw new BadRequestException('Caseload must be reassigned to an active user');
    }

    const { sessionsRevoked, participantsReassigned, tasksReassigned } =
      await this.prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id },
          data: { status: 'deactivated', updatedById: userId },
        });

        // Instant revocation — the reason this app uses server-side sessions,
        // not JWTs (§3.2). connect-pg-simple stores userId inside the sess JSON.
        const sessionsRevoked = await tx.$executeRaw`
          DELETE FROM "session" WHERE sess->>'userId' = ${id}`;

        const participants = await tx.participantProfile.updateMany({
          where: { assignedCaseManagerId: id, deletedAt: null },
          data: { assignedCaseManagerId: reassignToUserId, updatedById: userId },
        });

        // in_progress counts as open work for handoff purposes.
        const tasks = await tx.caseTask.updateMany({
          where: { assignedToId: id, deletedAt: null, status: { in: ['open', 'in_progress'] } },
          data: { assignedToId: reassignToUserId, updatedById: userId },
        });

        return {
          sessionsRevoked,
          participantsReassigned: participants.count,
          tasksReassigned: tasks.count,
        };
      });

    await this.audit.log({
      userId,
      action: 'update',
      entityType: 'user',
      entityId: id,
      oldValues: { status: existing.status },
      newValues: { status: 'deactivated' },
      metadata: { event: 'staff_departure', reassignToUserId },
    });
    await this.audit.log({
      userId,
      action: 'delete',
      entityType: 'session',
      entityId: id,
      metadata: { event: 'staff_departure', sessionsRevoked },
    });
    await this.audit.log({
      userId,
      action: 'update',
      entityType: 'participant_profile',
      metadata: {
        event: 'caseload_reassigned',
        fromUserId: id,
        toUserId: reassignToUserId,
        participantsReassigned,
      },
    });
    await this.audit.log({
      userId,
      action: 'update',
      entityType: 'case_task',
      metadata: {
        event: 'open_tasks_reassigned',
        fromUserId: id,
        toUserId: reassignToUserId,
        tasksReassigned,
      },
    });

    return { ok: true, sessionsRevoked, participantsReassigned, tasksReassigned };
  }

  async reactivate(id: string, userId: string) {
    const existing = await this.getRaw(id);
    if (existing.status !== 'deactivated') {
      throw new ConflictException('Only deactivated accounts can be reactivated');
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: { status: 'active', updatedById: userId },
      include: USER_ROLES_INCLUDE,
    });

    await this.audit.logUpdate(
      userId,
      'user',
      id,
      { status: existing.status },
      { status: updated.status },
    );
    return toSafeUser(updated);
  }

  /**
   * Lost-authenticator rescue: clears TOTP entirely (secret, flag, recovery
   * codes) so the user signs back in with their password and re-enrolls at
   * /account. Admin-gated because this REMOVES a second factor — the audit
   * row is the paper trail.
   */
  async resetTotp(id: string, userId: string, actingAdminCode?: string) {
    const existing = await this.getRaw(id);
    if (!existing.totpEnabled) {
      throw new ConflictException('This account does not have two-factor authentication enabled');
    }

    // Step-up (§3.2): removing a second factor demands the ACTING admin's own
    // current authenticator code — a signed-in-but-unattended admin screen
    // must not be enough. Skipped only while the admin has no TOTP yet
    // (bootstrap), which the mustSetupTotp nudge is busy closing.
    const actingAdmin = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (actingAdmin.totpEnabled) {
      if (!actingAdminCode) {
        throw new BadRequestException(
          'Enter the 6-digit code from your own authenticator to authorize this reset',
        );
      }
      if (!authenticator.verify({ token: actingAdminCode, secret: actingAdmin.totpSecret ?? '' })) {
        throw new BadRequestException('Invalid authentication code');
      }
    }

    const [updated] = await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id },
        data: { totpEnabled: false, totpSecret: null, updatedById: userId },
        include: USER_ROLES_INCLUDE,
      }),
      this.prisma.totpRecoveryCode.deleteMany({ where: { userId: id } }),
    ]);

    await this.audit.logUpdate(
      userId,
      'user',
      id,
      { totpEnabled: true },
      { totpEnabled: false, event: 'totp_reset_by_admin' },
    );
    return toSafeUser(updated);
  }

  // ── Region scopes (§7.2) ──────────────────────────────────────────────────
  // The table exists from day one; row-level ENFORCEMENT deliberately does not
  // activate until multi-state staffing needs it.

  async getRegionScopes(id: string) {
    await this.getRaw(id);
    const scopes = await this.prisma.userRegionScope.findMany({
      where: { userId: id },
      orderBy: { state: 'asc' },
    });
    return { states: scopes.map((s) => s.state) };
  }

  async setRegionScopes(id: string, states: string[], userId: string) {
    const target = await this.getRaw(id);
    const unique = [...new Set(states)].sort();

    // Administrators are always all-chapters (§7.2, docs/chapter-scoping.md):
    // the guard ignores scope rows for admins, so refuse to create the
    // contradiction rather than store dead data.
    if (unique.length && target.userRoles.some((ur) => ur.role.key === 'admin')) {
      throw new BadRequestException(
        'Administrators always see all chapters and cannot be chapter-scoped',
      );
    }

    const old = await this.prisma.userRegionScope.findMany({ where: { userId: id } });
    await this.prisma.$transaction(async (tx) => {
      await tx.userRegionScope.deleteMany({ where: { userId: id } });
      if (unique.length) {
        await tx.userRegionScope.createMany({
          data: unique.map((state) => ({ userId: id, state })),
        });
      }
    });

    // Scope changes gate future row-level access — audited as permission_change.
    await this.audit.log({
      userId,
      action: 'permission_change',
      entityType: 'user',
      entityId: id,
      oldValues: { regionScopes: old.map((s) => s.state).sort() },
      newValues: { regionScopes: unique },
    });

    return { states: unique };
  }

  /** Role keys come pre-validated by Zod against ROLE_KEYS; rows are seeded. */
  private async resolveRoles(keys: RoleKey[]) {
    const unique = [...new Set(keys)];
    const roles = await this.prisma.role.findMany({ where: { key: { in: unique } } });
    if (roles.length !== unique.length) {
      const found = new Set(roles.map((r) => r.key));
      const missing = unique.filter((k) => !found.has(k));
      throw new BadRequestException(`Unknown role(s): ${missing.join(', ')}`);
    }
    return roles;
  }
}

function sameSet(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v) => b.includes(v));
}
