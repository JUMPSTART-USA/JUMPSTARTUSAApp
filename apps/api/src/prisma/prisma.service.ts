import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@jumpstart/database';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({
      // Profile-photo bytes NEVER ride along in JSON responses or audit rows —
      // persons/donors are included wholesale all over (participant GETs,
      // volunteer GETs, donor lists), so the exclusion lives here globally
      // instead of in per-query selects. The photo endpoints opt back in with
      // an explicit `select: { photoData: true }`, which overrides the omit.
      // (DrugTestsService predates this and keeps its explicit VIEW_SELECT.)
      omit: {
        person: { photoData: true },
        donor: { photoData: true },
      },
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
