import { createHash, randomBytes } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../audit/audit.service';
import { assertChapterAccess } from '../../common/chapter.util';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedUser } from '../../common/types';
import { assertParticipant } from './portal.util';

/**
 * Staff-visible token rows. Note what is NOT in here: the token itself.
 *
 * Only the hash is stored now, so a link can be issued and revoked but never
 * re-read. That is a deliberate loss of a small convenience — staff could
 * previously copy an existing link out of the list — in exchange for a
 * database read no longer handing over every participant's portal. Issuing a
 * fresh link is the supported path, and it already revokes the previous one.
 */
const TOKEN_SELECT = {
  id: true,
  participantProfileId: true,
  active: true,
  createdAt: true,
  expiresAt: true,
  lastUsedAt: true,
  revokedAt: true,
} as const;

/** 90 days. Long enough to be useful, short enough that a stale link dies. */
const TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * Plain SHA-256, matching password-reset tokens. Not argon2: this is a 192-bit
 * random value, so there is no dictionary to slow an attacker down through,
 * and the lookup has to be a single indexed query rather than a scan.
 */
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

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

  /**
   * Revoke-then-create in one transaction.
   *
   * The raw token is returned HERE and nowhere else, ever again — only its
   * hash is stored. Callers must hand it to the user in this response; there
   * is no second chance to read it.
   */
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
        data: {
          participantProfileId,
          tokenHash: sha256(token),
          expiresAt: new Date(now.getTime() + TOKEN_TTL_MS),
          createdById: userId,
        },
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
    // The ONE place the raw token is ever returned — see the doc comment.
    return { ...created, token };
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
