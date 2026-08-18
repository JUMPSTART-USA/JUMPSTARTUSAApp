import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { randomBytes } from 'crypto';
import type { Prisma, UserStatus } from '@jumpstart/database';
import type { CreateUserInput, ListQuery, RoleKey, UpdateUserInput } from '@jumpstart/shared';
import type { AuthenticationResponseJSON } from '@simplewebauthn/server';
import { AuditService } from '../../audit/audit.service';
import { AuthService } from '../../auth/auth.service';
import { PasskeysService } from '../../auth/passkeys.service';
import { revokeAllSessions } from '../../auth/sessions.util';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../../mail/mail.service';
import { loadEnv } from '../../config/env';

/** The acting admin's proof of possession, as passed to PasskeysService. */
type StepUpProof = {
  code?: string;
  passkeyResponse?: AuthenticationResponseJSON;
  challenge?: string;
};

export interface UserListFilters {
  status?: UserStatus;
}

// Whitelist of sortable columns — sortBy comes from the query string and must
// never reach Prisma unchecked.
const SORTABLE = new Set(['email', 'firstName', 'lastName', 'status', 'lastLoginAt', 'createdAt']);

const USER_ROLES_INCLUDE = {
  userRoles: { include: { role: true } },
  regionScopes: true,
  _count: { select: { webauthnCredentials: true } },
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
    passkeyCount: user._count.webauthnCredentials,
    signInSuspendedAt: user.signInSuspendedAt,
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
    private readonly passkeys: PasskeysService,
    private readonly auth: AuthService,
  ) {}

  /**
   * Send a user a password-reset link (§3.1).
   *
   * Issues a LINK rather than setting a password, for the same reason
   * invitations do: a password an administrator chooses is a password an
   * administrator knows, and it would then live in whatever channel carried
   * it. This mints a single-use token, kills any outstanding one, and ends
   * every session the user currently holds — an admin reaching for this is
   * usually responding to a lost password or a suspected compromise, and both
   * want existing sessions gone.
   *
   * Step-up required: the returned link can set the account's password, so
   * this is a route to acting as that user. An unattended admin screen must
   * not be enough.
   */
  async resetPassword(id: string, actingUserId: string, proof: StepUpProof) {
    const existing = await this.getRaw(id);
    if (existing.status === 'deactivated') {
      throw new ConflictException('Reactivate this account before resetting its password');
    }
    await this.passkeys.requireStepUp(actingUserId, proof);

    const resetUrl = await this.buildInvitationUrl(id);
    const sessionsRevoked = await revokeAllSessions(this.prisma, id);

    const user = await this.prisma.user.update({
      where: { id },
      data: { updatedById: actingUserId },
      include: USER_ROLES_INCLUDE,
    });
    await this.audit.log({
      userId: actingUserId,
      action: 'update',
      entityType: 'user',
      entityId: id,
      // The token itself is never logged — only that a reset was issued.
      newValues: { passwordResetIssued: true, sessionsRevoked },
    });
    const email = await this.mail.sendPasswordReset(user.email, user.firstName, resetUrl);
    return {
      user: toSafeUser(user),
      resetUrl,
      sessionsRevoked,
      emailSent: email.sent,
      emailFrom: email.from,
    };
  }

  /**
   * Remove every passkey from an account, leaving TOTP and recovery codes
   * alone (§3.2).
   *
   * Distinct from resetTotp, which clears every second factor at once. The
   * common case is narrower than that: a lost or replaced phone whose owner
   * still has their authenticator app. Clearing TOTP too would force them to
   * re-enroll a factor that never stopped working.
   *
   * Sessions are revoked because a passkey may be what is holding one open.
   */
  async removePasskeys(id: string, actingUserId: string, proof: StepUpProof) {
    const existing = await this.getRaw(id);
    if (existing._count.webauthnCredentials === 0) {
      throw new ConflictException('This account has no passkeys to remove');
    }
    await this.passkeys.requireStepUp(actingUserId, proof);

    const removed = existing._count.webauthnCredentials;
    const [updated] = await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id },
        data: { updatedById: actingUserId },
        include: USER_ROLES_INCLUDE,
      }),
      this.prisma.webAuthnCredential.deleteMany({ where: { userId: id } }),
    ]);
    const sessionsRevoked = await revokeAllSessions(this.prisma, id);

    await this.audit.log({
      userId: actingUserId,
      action: 'update',
      entityType: 'user',
      entityId: id,
      oldValues: { passkeys: removed },
      newValues: { passkeys: 0, sessionsRevoked },
    });
    const email = await this.mail.sendPasskeysRemoved(updated.email, updated.firstName, removed);
    return {
      user: { ...toSafeUser(updated), passkeyCount: 0 },
      removed,
      sessionsRevoked,
      emailSent: email.sent,
    };
  }

  /**
   * Suspend sign-in: close the door, change nothing else (§3.2).
   *
   * Deliberately lighter than deactivate. Deactivation means somebody has left
   * and hands their caseload to a named colleague; suspension leaves
   * participants, tasks, roles and status exactly where they are, so restoring
   * is genuinely the inverse rather than an approximation of it.
   */
  async suspendSignIn(id: string, actingUserId: string) {
    if (id === actingUserId) {
      throw new BadRequestException('You cannot suspend your own sign-in');
    }
    const existing = await this.getRaw(id);
    if (existing.signInSuspendedAt) {
      throw new ConflictException('Sign-in for this account is already suspended');
    }
    if (existing.status === 'deactivated') {
      throw new ConflictException('This account is already deactivated');
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        signInSuspendedAt: new Date(),
        signInSuspendedById: actingUserId,
        updatedById: actingUserId,
      },
      include: USER_ROLES_INCLUDE,
    });
    // Suspension that left live sessions running would not be a suspension.
    const sessionsRevoked = await revokeAllSessions(this.prisma, id);

    await this.audit.log({
      userId: actingUserId,
      action: 'update',
      entityType: 'user',
      entityId: id,
      oldValues: { signInSuspended: false },
      newValues: { signInSuspended: true, sessionsRevoked },
    });
    const email = await this.mail.sendSignInSuspended(updated.email, updated.firstName);
    return { user: toSafeUser(updated), sessionsRevoked, emailSent: email.sent };
  }

  /** Undo a suspension. The account returns to whatever it was before. */
  async restoreSignIn(id: string, actingUserId: string) {
    const existing = await this.getRaw(id);
    if (!existing.signInSuspendedAt) {
      throw new ConflictException('Sign-in for this account is not suspended');
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: { signInSuspendedAt: null, signInSuspendedById: null, updatedById: actingUserId },
      include: USER_ROLES_INCLUDE,
    });
    await this.audit.log({
      userId: actingUserId,
      action: 'update',
      entityType: 'user',
      entityId: id,
      oldValues: { signInSuspended: true },
      newValues: { signInSuspended: false },
    });
    const email = await this.mail.sendSignInRestored(updated.email, updated.firstName);
    return { user: toSafeUser(updated), emailSent: email.sent };
  }

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
   * Invite flow (§6.14): the account is created as 'invited' with a password
   * nobody knows, and an invitation LINK is issued.
   *
   * It used to be a temporary password, emailed in clear and returned in this
   * response. That put a working credential in the recipient's mailbox, in the
   * sending mailbox's Sent Items, and in every backup of either, indefinitely
   * and with no expiry — a mailbox compromise was an account compromise. The
   * link is hashed at rest, single-use, and dies after seven days.
   *
   * The URL is still returned once, so the existing hand-off path survives:
   * outbound email is optional, and an admin who cannot send one reads the
   * link out instead. What is gone is the long-lived secret.
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

    /**
     * An UNUSABLE password: 32 random bytes hashed and immediately discarded.
     * The column is NOT NULL and the account must not be signable-into until
     * the invitation is redeemed, so it gets a hash of something nobody — this
     * process included, a line later — can produce.
     */
    const passwordHash = await argon2.hash(randomBytes(32).toString('hex'), {
      type: argon2.argon2id,
    });

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

    const inviteUrl = await this.buildInvitationUrl(user.id);
    // Unconfigured mail keeps the manual hand-off flow — see the doc comment.
    const email = await this.mail.sendInvite(user.email, user.firstName, inviteUrl);
    return { user: safe, inviteUrl, emailSent: email.sent, emailFrom: email.from };
  }

  /** The link an invitation resolves to. Raw token — returned once, never stored. */
  private async buildInvitationUrl(userId: string): Promise<string> {
    const token = await this.auth.issueInvitation(userId);
    return `${loadEnv().WEB_ORIGIN}/reset-password/${token}`;
  }

  /**
   * Re-issue an invitation: only for accounts that have never signed in.
   * Issuing a new link kills any outstanding one, so a lost or intercepted
   * invitation is revoked by simply sending another.
   *
   * No longer resets the password hash — there is no password to reset, and
   * overwriting it would have been the one way to lock out an account that had
   * in fact already been set up.
   */
  async resendInvite(id: string, userId: string) {
    const existing = await this.getRaw(id);
    if (existing.status !== 'invited') {
      throw new BadRequestException('Only accounts that have never signed in can be re-invited');
    }
    const user = await this.prisma.user.update({
      where: { id },
      data: { updatedById: userId },
      include: USER_ROLES_INCLUDE,
    });
    await this.audit.log({
      userId,
      action: 'update',
      entityType: 'user',
      entityId: id,
      newValues: { resentInvite: true },
    });
    const inviteUrl = await this.buildInvitationUrl(user.id);
    const email = await this.mail.sendInvite(user.email, user.firstName, inviteUrl);
    return { user: toSafeUser(user), inviteUrl, emailSent: email.sent, emailFrom: email.from };
  }

  async update(
    id: string,
    input: UpdateUserInput,
    userId: string,
    stepUp: StepUpProof = {},
  ) {
    const existing = await this.getRaw(id);

    /**
     * Sensitive edits: the two that can END in a takeover rather than a typo.
     *
     * Changing someone's EMAIL then using forgot-password is a complete
     * account takeover, and it used to need nothing but a signed-in admin
     * session. Changing ROLES is the privilege-escalation half of the same
     * problem. Both now demand the acting admin prove possession of their own
     * second factor — the same bar already applied to adding or removing one.
     */
    const changingEmail = !!input.email && input.email !== existing.email;
    const changingRoles =
      !!input.roles && !sameSet(input.roles, existing.userRoles.map((ur) => ur.role.key));
    if (changingEmail || changingRoles) {
      await this.passkeys.requireStepUp(userId, stepUp);
    }

    /**
     * No self-elevation. An account holding admin.users could grant ITSELF the
     * admin role, so the permission that manages users was quietly the
     * permission that grants everything. Acting on your own roles at all is
     * refused: an admin who needs their roles changed asks another admin, and
     * that leaves two people in the audit log instead of one.
     */
    if (changingRoles && id === userId) {
      throw new ForbiddenException(
        'You cannot change your own roles — ask another administrator',
      );
    }

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
      await this.mail.sendRolesChanged(newSafe.email, newSafe.firstName, newSafe.roles);
    }

    /**
     * Tell the account holder their address was changed, at the address they
     * had BEFORE. Audit is detective and nobody reads it daily; the owner is
     * the one party guaranteed to notice, and the old mailbox is the only one
     * an attacker performing this takeover does not control.
     *
     * NOT the same thing as verifying the new address, which would PREVENT the
     * takeover rather than report it. That needs a pending-change record and a
     * confirmation round trip — see the note in the phase 3 commit message.
     */
    if (changingEmail) {
      await this.mail.sendEmailChanged(existing.email, existing.firstName, newSafe.email);
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
        // not JWTs (§3.2). Runs on the transaction client so the deactivation
        // and the revocation land together or not at all.
        const sessionsRevoked = await revokeAllSessions(tx, id);

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
  async resetTotp(
    id: string,
    userId: string,
    stepUp: { code?: string; passkeyResponse?: AuthenticationResponseJSON; challenge?: string },
  ) {
    const existing = await this.getRaw(id);
    if (!existing.totpEnabled && existing._count.webauthnCredentials === 0) {
      throw new ConflictException('This account has no second factor to reset');
    }

    // Step-up (§3.2): removing someone's second factor demands proof from the
    // ACTING admin — a code, or a passkey assertion when that is what they
    // hold. requireStepUp is the single rule (a passkey-only admin used to
    // sail through this check entirely). No factor at all = nothing to prove
    // with, which the mustSetupTotp nudge is busy closing.
    await this.passkeys.requireStepUp(userId, stepUp);

    const [updated] = await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id },
        data: { totpEnabled: false, totpSecret: null, updatedById: userId },
        include: USER_ROLES_INCLUDE,
      }),
      this.prisma.totpRecoveryCode.deleteMany({ where: { userId: id } }),
      this.prisma.webAuthnCredential.deleteMany({ where: { userId: id } }),
    ]);

    /**
     * The account's second factor is gone, so every live session for it is now
     * a session standing on a password alone — including any an attacker holds.
     * Removing the factor without ending them left the weaker state running.
     */
    const sessionsRevoked = await revokeAllSessions(this.prisma, id);

    await this.audit.logUpdate(
      userId,
      'user',
      id,
      { totpEnabled: existing.totpEnabled, passkeys: existing._count.webauthnCredentials },
      { totpEnabled: false, passkeys: 0, event: 'second_factor_reset_by_admin', sessionsRevoked },
    );
    // The person whose protection was just removed is told. This is the
    // legitimate lost-authenticator rescue most of the time; the one time it
    // is not, they are the only party who can tell.
    await this.mail.sendSecondFactorReset(updated.email, updated.firstName);
    // The include ran inside the same transaction as the deletes, so its
    // _count still reflects the pre-reset rows — report the real post state.
    return { ...toSafeUser(updated), passkeyCount: 0 };
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
