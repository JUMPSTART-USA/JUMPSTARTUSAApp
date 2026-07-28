import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Bloomerang mirror sync (§6.8). Bloomerang stays the giving system of record;
 * this service pulls constituents/transactions into the local donors/donations
 * mirror. Conflict rule: Bloomerang wins on every field it owns; the platform
 * owns only the campaign/event/person links and local notes.
 *
 * The real HTTP client is a Phase-1 integration task — the fetch methods below
 * are stubs, but the SyncRun bookkeeping (feeds the "last synced" dashboard
 * note) is live now.
 */
@Injectable()
export class BloomerangSyncService {
  private readonly logger = new Logger(BloomerangSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async syncNow(userId: string) {
    // One run at a time — a concurrent sync would double-apply deltas.
    const running = await this.prisma.syncRun.findFirst({
      where: { target: 'bloomerang', status: 'running' },
    });
    if (running) throw new ConflictException('A Bloomerang sync is already running');

    const run = await this.prisma.syncRun.create({ data: { target: 'bloomerang' } });
    await this.audit.logCreate(userId, 'sync_run', run.id, { target: 'bloomerang' });

    if (!process.env.BLOOMERANG_API_KEY) {
      return this.prisma.syncRun.update({
        where: { id: run.id },
        data: {
          status: 'success',
          finishedAt: new Date(),
          stats: { skipped: 'no api key configured' },
        },
      });
    }

    try {
      const constituents = await this.fetchConstituents();
      const transactions = await this.fetchTransactions();
      const campaigns = await this.fetchCampaigns();
      const appeals = await this.fetchAppeals();
      // TODO(phase-1 integration): upsert donors/donations by bloomerangId and
      // campaigns/events by crmId, stamping lastSyncedAt and never touching
      // platform-owned fields (personId, notes, campaignId links,
      // registrations).
      return await this.prisma.syncRun.update({
        where: { id: run.id },
        data: {
          status: 'success',
          finishedAt: new Date(),
          stats: {
            constituents: constituents.length,
            transactions: transactions.length,
            campaigns: campaigns.length,
            appeals: appeals.length,
          },
        },
      });
    } catch (err) {
      // Sync failures alert admins via the failed run row (§6.8).
      this.logger.error(
        'Bloomerang sync failed',
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

  listRuns(limit = 20) {
    return this.prisma.syncRun.findMany({
      where: { target: 'bloomerang' },
      orderBy: { startedAt: 'desc' },
      take: limit,
    });
  }

  // TODO(phase-1 integration): page GET /constituents from the Bloomerang REST
  // API (delta by lastModified since the previous successful run).
  private async fetchConstituents(): Promise<unknown[]> {
    return [];
  }

  // TODO(phase-1 integration): page GET /transactions, mapping Bloomerang
  // campaign/appeal fields onto local campaignId/eventId links.
  private async fetchTransactions(): Promise<unknown[]> {
    return [];
  }

  // TODO(phase-1 integration): page GET /campaigns — mirrored into the local
  // campaigns table by crmId (name, dates, goal, status).
  private async fetchCampaigns(): Promise<unknown[]> {
    return [];
  }

  // TODO(phase-1 integration): page GET /appeals — Bloomerang's closest event
  // analog, mirrored into the local events table by crmId.
  private async fetchAppeals(): Promise<unknown[]> {
    return [];
  }
}
