import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Neon CRM mirror sync — the Neon-flavored counterpart of
 * BloomerangSyncService (§6.8). Neon CRM stays the giving system of record;
 * this service pulls accounts/donations into the local donors/donations
 * mirror. Conflict rule: the CRM wins on every field it owns; the platform
 * owns only the campaign/event/person links and local notes.
 *
 * The real HTTP client is a Phase-1 integration task — the fetch methods below
 * are stubs, but the SyncRun bookkeeping (feeds the "last synced" dashboard
 * note) is live now. That phase also adds a donors.neonCrmId column for the
 * upsert key, mirroring donors.bloomerangId.
 */
@Injectable()
export class NeonCrmSyncService {
  private readonly logger = new Logger(NeonCrmSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async syncNow(userId: string) {
    // One run at a time — a concurrent sync would double-apply deltas.
    const running = await this.prisma.syncRun.findFirst({
      where: { target: 'neoncrm', status: 'running' },
    });
    if (running) throw new ConflictException('A Neon CRM sync is already running');

    const run = await this.prisma.syncRun.create({ data: { target: 'neoncrm' } });
    await this.audit.logCreate(userId, 'sync_run', run.id, { target: 'neoncrm' });

    if (!process.env.NEONCRM_ORG_ID || !process.env.NEONCRM_API_KEY) {
      return this.prisma.syncRun.update({
        where: { id: run.id },
        data: {
          status: 'success',
          finishedAt: new Date(),
          stats: { skipped: 'no api credentials configured' },
        },
      });
    }

    try {
      const accounts = await this.fetchAccounts();
      const donations = await this.fetchDonations();
      const campaigns = await this.fetchCampaigns();
      const events = await this.fetchEvents();
      // TODO(phase-1 integration): upsert donors/donations by neonCrmId and
      // campaigns/events by crmId, stamping lastSyncedAt and never touching
      // platform-owned fields (personId, notes, campaignId links,
      // registrations).
      return await this.prisma.syncRun.update({
        where: { id: run.id },
        data: {
          status: 'success',
          finishedAt: new Date(),
          stats: {
            accounts: accounts.length,
            donations: donations.length,
            campaigns: campaigns.length,
            events: events.length,
          },
        },
      });
    } catch (err) {
      // Sync failures alert admins via the failed run row (§6.8).
      this.logger.error(
        'Neon CRM sync failed',
        err instanceof Error ? err.stack : String(err),
      );
      return await this.prisma.syncRun.update({
        where: { id: run.id },
        data: {
          status: 'failed',
          finishedAt: new Date(),
          error: err instanceof Error ? err.message : String(err),
        },
      });
    }
  }

  // TODO(phase-1 integration): page GET /v2/accounts from the Neon CRM REST
  // API (delta by lastModifiedDate since the previous successful run),
  // authenticating with NEONCRM_ORG_ID / NEONCRM_API_KEY basic auth.
  private async fetchAccounts(): Promise<unknown[]> {
    return [];
  }

  // TODO(phase-1 integration): page GET /v2/donations, mapping Neon campaign/
  // fund fields onto local campaignId/eventId links.
  private async fetchDonations(): Promise<unknown[]> {
    return [];
  }

  // TODO(phase-1 integration): page GET /v2/campaigns — mirrored into the
  // local campaigns table by crmId (name, dates, goal, status).
  private async fetchCampaigns(): Promise<unknown[]> {
    return [];
  }

  // TODO(phase-1 integration): page GET /v2/events — mirrored into the local
  // events table by crmId (name, date, location, financials).
  private async fetchEvents(): Promise<unknown[]> {
    return [];
  }
}
