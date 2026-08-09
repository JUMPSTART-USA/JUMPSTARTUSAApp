import { randomBytes } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../audit/audit.service';
import { assertChapterAccess } from '../../common/chapter.util';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedUser } from '../../common/types';
import { assertParticipant } from './portal.util';

/**
 * Staff-visible token rows. The raw token IS returned to staff (they need it
 * to build/copy the portal link) but is NEVER copied into audit rows — it is
 * a bearer credential.
 */
const TOKEN_SELECT = {
  id: true,
  participantProfileId: true,
  token: true,
  active: true,
  createdAt: true,
  lastUsedAt: true,
  revokedAt: true,
} as const;

/**
 * Participant portal link tokens. Invariant: at most ONE active token per
 * participant — issuing a new one always revokes whatever is active, so a
 * lost/compromised link is killed by simply generating a fresh one.
 */
@Injectable()
export class PortalTokensService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(participantProfileId: string, user: AuthenticatedUser) {
    // Chapter scoping (§7.2): the list is participant-keyed — assert that
    // participant's chapter instead of filtering. Tokens are bearer
    // credentials, so a cross-chapter read is a link handover.
    await assertParticipant(this.prisma, participantProfileId, user.chapter);
    const items = await this.prisma.participantPortalToken.findMany({
      where: { participantProfileId },
      orderBy: { createdAt: 'desc' },
      select: TOKEN_SELECT,
    });
    return { items };
  }

  /** Revoke-then-create in one transaction; returns the fresh row incl. token. */
  async issue(participantProfileId: string, user: AuthenticatedUser) {
    const userId = user.id;
    await assertParticipant(this.prisma, participantProfileId, user.chapter);
    const token = randomBytes(24).toString('hex');
    const now = new Date();

    const [revoked, created] = await this.prisma.$transaction([
      this.prisma.participantPortalToken.updateMany({
        where: { participantProfileId, active: true },
        data: { active: false, revokedAt: now },
      }),
      this.prisma.participantPortalToken.create({
        data: { participantProfileId, token, createdById: userId },
        select: TOKEN_SELECT,
      }),
    ]);

    // Metadata only — the token value must not land in the audit log.
    await this.audit.log({
      userId,
      action: 'create',
      entityType: 'participant_portal_token',
      entityId: created.id,
      metadata: { participantProfileId, revokedPrevious: revoked.count },
    });
    return created;
  }

  /** Idempotent: revoking an already-revoked token is a no-op {ok:true}. */
  async revoke(id: string, user: AuthenticatedUser) {
    const userId = user.id;
    const existing = await this.prisma.participantPortalToken.findUnique({
      where: { id },
      select: {
        ...TOKEN_SELECT,
        participantProfile: { select: { chapterState: true } },
      },
    });
    if (!existing) throw new NotFoundException('Portal token not found');
    // Chapter scoping (§7.2): derived through the participant profile.
    assertChapterAccess(user.chapter, existing.participantProfile.chapterState);

    if (existing.active) {
      await this.prisma.participantPortalToken.update({
        where: { id },
        data: { active: false, revokedAt: new Date() },
      });
      await this.audit.log({
        userId,
        action: 'update',
        entityType: 'participant_portal_token',
        entityId: id,
        metadata: { participantProfileId: existing.participantProfileId, revoked: true },
      });
    }
    return { ok: true };
  }
}
