import { BadRequestException, Injectable } from '@nestjs/common';
import type {
  PublicAlumniUpdateInput,
  PublicReferralInput,
  PublicVolunteerApplicationInput,
} from '@jumpstart/shared';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Public submission handlers (§6.11). Submissions land in intake queues —
 * NEVER in operational tables — and responses leak nothing about the queues.
 * Audit rows record that a submission happened without copying the PII into
 * the audit log (the referral queue especially is walled off behind
 * referral_inbox.read; audit.read must not become a side door).
 */
@Injectable()
export class PublicIntakeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async submitVolunteerApplication(input: PublicVolunteerApplicationInput) {
    const { turnstileToken: _token, consent: _consent, ...fields } = input;
    const row = await this.prisma.volunteerApplication.create({
      // consent is a required literal in the schema; stamp when it was given
      data: { ...fields, consentAt: new Date() },
    });
    await this.audit.log({
      userId: null,
      action: 'create',
      entityType: 'volunteer_application',
      entityId: row.id,
      metadata: { source: 'public_form' },
    });
    return { ok: true };
  }

  async submitReferral(input: PublicReferralInput) {
    const { turnstileToken: _token, ...fields } = input;
    const row = await this.prisma.referralInboxItem.create({ data: fields });
    await this.audit.log({
      userId: null,
      action: 'create',
      entityType: 'referral_inbox_item',
      entityId: row.id,
      metadata: { source: 'public_form' },
    });
    return { ok: true };
  }

  /**
   * Tokenized alumni self-update (§6.7/§6.11): single-use link, no login.
   * One generic error for every failure mode — the public endpoint must not
   * confirm whether a token exists, expired, or was already used.
   */
  async submitAlumniUpdate(input: PublicAlumniUpdateInput) {
    const { token, ...fields } = input;
    const formToken = await this.prisma.alumniFormToken.findUnique({ where: { token } });
    if (!formToken || formToken.usedAt || formToken.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('This link is invalid or has expired');
    }

    const [, row] = await this.prisma.$transaction([
      this.prisma.alumniFormToken.update({
        where: { id: formToken.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.alumniUpdate.create({
        data: { ...fields, participantProfileId: formToken.participantProfileId },
      }),
    ]);

    await this.audit.log({
      userId: null,
      action: 'create',
      entityType: 'alumni_update',
      entityId: row.id,
      metadata: { source: 'public_form', alumniFormTokenId: formToken.id },
    });
    return { ok: true };
  }
}
