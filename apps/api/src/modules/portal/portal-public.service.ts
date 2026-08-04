import { HttpException, HttpStatus, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type {
  MeetingRequestInput,
  PortalMessageInput,
  TransportRequestInput,
} from '@jumpstart/shared';
import { AuditService } from '../../audit/audit.service';
import { loadEnv } from '../../config/env';
import { escapeHtml, MailService } from '../../mail/mail.service';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Belt-and-braces on top of the IP throttle: one participant link can create
 * at most this many rows per calendar day across all three queues.
 */
const DAILY_SUBMISSION_CAP = 30;

/** Issued tokens are 48-char lowercase hex; gate cheaply before touching the DB. */
const TOKEN_SHAPE = /^[0-9a-f]{16,128}$/i;

const TOKEN_LOOKUP_SELECT = {
  id: true,
  active: true,
  revokedAt: true,
  participantProfileId: true,
  participantProfile: {
    select: {
      deletedAt: true,
      participantNumber: true,
      person: { select: { firstName: true, lastName: true } },
    },
  },
} as const;

/**
 * Admin-assigned notification recipients (Admin → Settings): a user id per
 * submission type, e.g. { messages: '<userId>', meetings: null, transport: null }.
 */
export const PORTAL_NOTIFICATIONS_SETTING_KEY = 'portal.notifications';

type PortalSubmissionType = 'messages' | 'meetings' | 'transport';

const SUBMISSION_LABELS: Record<PortalSubmissionType, string> = {
  messages: 'message',
  meetings: 'meeting request',
  transport: 'transportation request',
};

/**
 * The tokenized participant portal (§6.11-style public surface). No session,
 * no login — the link IS the credential. Every failure mode is the same bare
 * 404 so the endpoint never confirms whether a token exists, was revoked, or
 * belongs to a deleted participant. Responses to submissions are a bare
 * { ok: true } — queue internals never leak to the public.
 */
@Injectable()
export class PortalPublicService {
  private readonly logger = new Logger(PortalPublicService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
  ) {}

  /** Greeting payload for the portal landing page. */
  async resolve(rawToken: string) {
    const token = await this.requireToken(rawToken);
    return {
      firstName: token.participantProfile.person.firstName,
      participantNumber: token.participantProfile.participantNumber,
    };
  }

  async submitMessage(rawToken: string, input: PortalMessageInput) {
    const token = await this.requireToken(rawToken);
    await this.enforceDailyCap(token.participantProfileId);
    const row = await this.prisma.portalMessage.create({
      data: {
        participantProfileId: token.participantProfileId,
        subject: input.subject ?? null,
        body: input.body,
      },
    });
    await this.auditSubmission('portal_message', row.id, token.id);
    await this.notifyAssignee('messages', token);
    return { ok: true };
  }

  async submitMeetingRequest(rawToken: string, input: MeetingRequestInput) {
    const token = await this.requireToken(rawToken);
    await this.enforceDailyCap(token.participantProfileId);
    const row = await this.prisma.meetingRequest.create({
      data: {
        participantProfileId: token.participantProfileId,
        preferredDate: input.preferredDate,
        preferredTime: input.preferredTime ?? null,
        reason: input.reason,
      },
    });
    await this.auditSubmission('meeting_request', row.id, token.id);
    await this.notifyAssignee('meetings', token);
    return { ok: true };
  }

  async submitTransportRequest(rawToken: string, input: TransportRequestInput) {
    const token = await this.requireToken(rawToken);
    await this.enforceDailyCap(token.participantProfileId);
    const row = await this.prisma.transportRequest.create({
      data: {
        participantProfileId: token.participantProfileId,
        tripDate: input.tripDate,
        tripTime: input.tripTime,
        destination: input.destination,
        purpose: input.purpose ?? null,
        returnTripRequested: input.returnTripRequested,
        // Return fields are stored only for actual return trips — stray
        // values on a one-way request are dropped, not persisted.
        ...(input.returnTripRequested
          ? {
              returnDate: input.returnDate,
              returnTime: input.returnTime,
              returnDestination: input.returnDestination,
            }
          : {}),
      },
    });
    await this.auditSubmission('transport_request', row.id, token.id);
    await this.notifyAssignee('transport', token);
    return { ok: true };
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  /**
   * Resolves + validates the token and touches lastUsedAt on EVERY hit (reads
   * included) so staff can see whether a link is actually being used.
   */
  private async requireToken(rawToken: string) {
    if (!TOKEN_SHAPE.test(rawToken)) throw new NotFoundException();

    const token = await this.prisma.participantPortalToken.findUnique({
      where: { token: rawToken },
      select: TOKEN_LOOKUP_SELECT,
    });
    if (!token || !token.active || token.revokedAt || token.participantProfile.deletedAt) {
      throw new NotFoundException();
    }

    await this.prisma.participantPortalToken.update({
      where: { id: token.id },
      data: { lastUsedAt: new Date() },
    });
    return token;
  }

  /**
   * Counts today's rows across all three queues (soft-deleted included — staff
   * clearing spam must not refill the bucket) against the per-link daily cap.
   */
  private async enforceDailyCap(participantProfileId: string) {
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const where = { participantProfileId, createdAt: { gte: dayStart } };

    const [messages, meetings, transports] = await this.prisma.$transaction([
      this.prisma.portalMessage.count({ where }),
      this.prisma.meetingRequest.count({ where }),
      this.prisma.transportRequest.count({ where }),
    ]);
    if (messages + meetings + transports >= DAILY_SUBMISSION_CAP) {
      throw new HttpException(
        'Daily submission limit reached — please try again tomorrow',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /**
   * Emails the admin-designated recipient for this submission type, if one is
   * set and still an active user. Best-effort only: the participant's
   * submission has already been queued, so nothing here may throw. Like the
   * audit row, the email says THAT a submission happened — never its content.
   */
  private async notifyAssignee(
    type: PortalSubmissionType,
    token: {
      participantProfile: {
        participantNumber: string;
        person: { firstName: string; lastName: string };
      };
    },
  ) {
    try {
      const setting = await this.prisma.appSetting.findUnique({
        where: { key: PORTAL_NOTIFICATIONS_SETTING_KEY },
      });
      const value = setting?.value;
      const userId =
        value && typeof value === 'object' && !Array.isArray(value)
          ? (value as Record<string, unknown>)[type]
          : null;
      if (typeof userId !== 'string' || !userId) return;

      const user = await this.prisma.user.findFirst({
        where: { id: userId, deletedAt: null, status: 'active' },
        select: { email: true, firstName: true },
      });
      if (!user) return;

      const { person, participantNumber } = token.participantProfile;
      const participant = `${person.firstName} ${person.lastName}`;
      const kind = SUBMISSION_LABELS[type];
      const origin = loadEnv().WEB_ORIGIN;
      await this.mail.send(
        user.email,
        `Portal: new ${kind} from ${participant}`,
        `
        <p>Hi ${escapeHtml(user.firstName)},</p>
        <p>${escapeHtml(participant)} (#${escapeHtml(participantNumber)}) submitted a new
        ${kind} through their participant portal link.</p>
        <p><a href="${origin}/case-management/requests">Review it under Case Management &rarr; Requests</a>.</p>
        <p>— JUMPSTART USA Operations Platform</p>`,
      );
    } catch (err) {
      this.logger.error(
        `portal notification failed (${type})`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  /** Audit rows record THAT a submission happened — never the body content. */
  private auditSubmission(entityType: string, entityId: string, portalTokenId: string) {
    return this.audit.log({
      userId: null,
      action: 'create',
      entityType,
      entityId,
      metadata: { via: 'portal', portalTokenId },
    });
  }
}
