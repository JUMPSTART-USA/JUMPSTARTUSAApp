import { randomUUID } from 'node:crypto';
import {
  CHAPTER_NAMES,
  CHAPTER_STATES,
  PUBLIC_INTAKE_STATES,
  isChapterState,
  publicReferralSchema,
  publicVolunteerApplicationSchema,
} from '@jumpstart/shared';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { hashPassword } from '../src/auth/auth.service';
import { AdminUsersService } from '../src/modules/admin/users.service';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * The national chapter (USA), §7.2.
 *
 * USA is a PEER of the six state chapters, not a parent: national staff hold
 * their own Development records and are isolated from every state chapter's,
 * exactly as the states are isolated from one another. It grants no
 * cross-chapter visibility, and these tests pin that — the tempting future
 * mistake is to treat "USA" as a synonym for all-chapters, which would hand
 * national staff every chapter's donor file in one line of code.
 *
 * The second half pins the boundary that has no type to protect it: the PUBLIC
 * intake forms must not offer USA. Those queues are worked by state chapter
 * staff, so a referral routed to the national office would sit in a queue
 * nobody opens.
 */
let app: NestExpressApplication;
let prisma: PrismaService;
let users: AdminUsersService;

beforeAll(async () => {
  app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: false });
  configureApp(app);
  await app.init();
  prisma = app.get(PrismaService);
  users = app.get(AdminUsersService);
});

afterAll(async () => {
  await app?.close();
});

describe('USA is a chapter like any other', () => {
  it('is a chapter state', () => {
    expect(isChapterState('USA')).toBe(true);
    expect(CHAPTER_STATES).toContain('USA');
  });

  it('has a name that reads as the national office, not a state', () => {
    expect(CHAPTER_NAMES.USA).toBe('JUMPSTART USA (National)');
  });

  it('every chapter has a display name — a new chapter must not render as a bare code', () => {
    for (const state of CHAPTER_STATES) {
      expect(CHAPTER_NAMES[state]).toBeTruthy();
    }
  });
});

describe('USA is NOT offered to the public', () => {
  it('is excluded from the public intake list', () => {
    expect(PUBLIC_INTAKE_STATES).not.toContain('USA');
    // Every public option must still be a real chapter — the two lists diverge
    // in one direction only.
    for (const state of PUBLIC_INTAKE_STATES) {
      expect(isChapterState(state)).toBe(true);
    }
  });

  it('the public volunteer application rejects USA', () => {
    const base = {
      firstName: 'Pat',
      lastName: 'Probe',
      email: 'pat@example.test',
      consent: true as const,
    };
    expect(publicVolunteerApplicationSchema.safeParse({ ...base, state: 'USA' }).success).toBe(
      false,
    );
    // Control: a real chapter still passes, so the rejection is about USA and
    // not about the fixture being malformed.
    expect(publicVolunteerApplicationSchema.safeParse({ ...base, state: 'SC' }).success).toBe(true);
  });

  it('the public referral rejects USA', () => {
    const base = {
      referrerType: 'self' as const,
      subjectFirstName: 'Sam',
      subjectLastName: 'Probe',
      needs: 'Housing support after release.',
    };
    expect(publicReferralSchema.safeParse({ ...base, state: 'USA' }).success).toBe(false);
    expect(publicReferralSchema.safeParse({ ...base, state: 'SC' }).success).toBe(true);
  });
});

describe('an admin can scope a user to USA', () => {
  async function makeUser() {
    return prisma.user.create({
      data: {
        email: `national-${randomUUID()}@example.test`,
        passwordHash: await hashPassword(randomUUID()),
        firstName: 'National',
        lastName: 'Probe',
        status: 'active',
      },
    });
  }

  it('assigns USA as the chapter and reads it back', async () => {
    const user = await makeUser();
    const admin = await makeUser();

    await users.setRegionScopes(user.id, ['USA'], admin.id);

    const scopes = await prisma.userRegionScope.findMany({ where: { userId: user.id } });
    expect(scopes).toHaveLength(1);
    expect(scopes[0]?.state).toBe('USA');
  });

  it('replaces a state chapter with USA rather than accumulating scopes', async () => {
    const user = await makeUser();
    const admin = await makeUser();

    await users.setRegionScopes(user.id, ['SC'], admin.id);
    await users.setRegionScopes(user.id, ['USA'], admin.id);

    const scopes = await prisma.userRegionScope.findMany({ where: { userId: user.id } });
    // One chapter per user (§7.2). Two rows would read as all-chapters to some
    // callers and as ambiguous to others.
    expect(scopes).toHaveLength(1);
    expect(scopes[0]?.state).toBe('USA');
  });

  it('clearing scopes still means ALL chapters, not USA', async () => {
    const user = await makeUser();
    const admin = await makeUser();

    await users.setRegionScopes(user.id, ['USA'], admin.id);
    await users.setRegionScopes(user.id, [], admin.id);

    const scopes = await prisma.userRegionScope.findMany({ where: { userId: user.id } });
    // The distinction the whole model rests on: no scope row = every chapter.
    // If USA were ever treated as "the default chapter", removing a scope would
    // silently narrow an all-chapters user instead of widening them.
    expect(scopes).toHaveLength(0);
  });
});
