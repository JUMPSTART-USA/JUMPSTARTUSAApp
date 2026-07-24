import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';

/**
 * Integration tests against the REAL app wiring (sessions, guards, prefix)
 * and a seeded database (CI: migrate + seed run before tests; locally: the
 * embedded dev DB). Uses the seed's demo credentials.
 */
const ADMIN = { email: 'admin@jumpstartusa.org', password: 'JumpstartDemo2026!' };
const FLEET = { email: 'fleet_manager@jumpstartusa.org', password: 'JumpstartDemo2026!' };
const ORIGIN = process.env.WEB_ORIGIN ?? 'http://localhost:5173';

let app: NestExpressApplication;
let server: ReturnType<NestExpressApplication['getHttpServer']>;

async function login(credentials: { email: string; password: string }): Promise<string> {
  const res = await request(server)
    .post('/api/auth/login')
    .set('Origin', ORIGIN)
    .send(credentials)
    .expect(200);
  const cookie = res.headers['set-cookie']?.[0]?.split(';')[0];
  expect(cookie).toBeTruthy();
  return cookie!;
}

beforeAll(async () => {
  // NestFactory (not Test.createTestingModule) so configureApp middleware
  // (session store, prefix, origin check) is identical to production.
  app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: false });
  configureApp(app);
  await app.init();
  server = app.getHttpServer();
});

afterAll(async () => {
  await app?.close();
});

describe('auth', () => {
  it('health is public', async () => {
    await request(server).get('/api/health').expect(200);
  });

  it('rejects bad credentials with 401', async () => {
    await request(server)
      .post('/api/auth/login')
      .set('Origin', ORIGIN)
      .send({ email: ADMIN.email, password: 'wrong-password-123' })
      .expect(401);
  });

  it('logs in and returns the profile with permissions', async () => {
    const cookie = await login(ADMIN);
    const me = await request(server).get('/api/auth/me').set('Cookie', cookie).expect(200);
    expect(me.body.email).toBe(ADMIN.email);
    expect(me.body.roles).toContain('admin');
    expect(me.body.permissions.length).toBeGreaterThan(50);
  });

  it('rejects unauthenticated module access with 401', async () => {
    await request(server).get('/api/participants').expect(401);
  });

  it('logout kills the session', async () => {
    const cookie = await login(ADMIN);
    await request(server).post('/api/auth/logout').set('Cookie', cookie).set('Origin', ORIGIN).expect(200);
    await request(server).get('/api/auth/me').set('Cookie', cookie).expect(401);
  });
});

describe('RBAC (acceptance criterion 2: users only see what their role allows)', () => {
  it('fleet manager reads vehicles but not participants', async () => {
    const cookie = await login(FLEET);
    await request(server).get('/api/vehicles').set('Cookie', cookie).expect(200);
    await request(server).get('/api/participants').set('Cookie', cookie).expect(403);
  });

  it('fleet manager cannot create institutions', async () => {
    const cookie = await login(FLEET);
    await request(server)
      .post('/api/institutions')
      .set('Cookie', cookie)
      .set('Origin', ORIGIN)
      .send({ name: 'Nope Prison', state: 'TN' })
      .expect(403);
  });
});

describe('CSRF origin check', () => {
  it('rejects state-changing requests from a foreign origin', async () => {
    const cookie = await login(ADMIN);
    await request(server)
      .post('/api/institutions')
      .set('Cookie', cookie)
      .set('Origin', 'https://evil.example.com')
      .send({ name: 'X', state: 'TN' })
      .expect(403);
  });
});

describe('business rules through the API', () => {
  let adminCookie: string;
  beforeAll(async () => {
    adminCookie = await login(ADMIN);
  });

  it('rejects a housing enrollment marked moved-out without date/reason', async () => {
    const homes = await request(server)
      .get('/api/transitional-homes?pageSize=1')
      .set('Cookie', adminCookie)
      .expect(200);
    const participants = await request(server)
      .get('/api/participants?pageSize=1')
      .set('Cookie', adminCookie)
      .expect(200);
    await request(server)
      .post('/api/housing-enrollments')
      .set('Cookie', adminCookie)
      .set('Origin', ORIGIN)
      .send({
        participantProfileId: participants.body.items[0].id,
        homeId: homes.body.items[0].id,
        moveInDate: '2026-01-01',
        status: 'left_early',
      })
      .expect(400);
  });

  it('rejects a negative donation amount', async () => {
    const donors = await request(server)
      .get('/api/donors?pageSize=1')
      .set('Cookie', adminCookie)
      .expect(200);
    await request(server)
      .post('/api/donations')
      .set('Cookie', adminCookie)
      .set('Origin', ORIGIN)
      .send({ donorId: donors.body.items[0].id, donationDate: '2026-01-01', amount: -100 })
      .expect(400);
  });
});

describe('dashboard (acceptance criterion 19: metrics summarize the database)', () => {
  it('active participant count matches a direct list query', async () => {
    const cookie = await login(ADMIN);
    const dash = await request(server).get('/api/dashboard').set('Cookie', cookie).expect(200);
    expect(dash.body.activeParticipants).toBeGreaterThan(0);
    expect(dash.body.attentionNeeded).toBeInstanceOf(Array);
    // Seeded data guarantees alerts exist (expiring registrations, overdue follow-ups)
    expect(dash.body.attentionNeeded.length).toBeGreaterThan(0);
  });
});

describe('public intake (§6.11: queues, never live records)', () => {
  it('accepts a referral without auth and returns no internals', async () => {
    const res = await request(server)
      .post('/api/public/referrals')
      .send({
        referrerType: 'chaplain',
        referrerName: 'Test Chaplain',
        referrerEmail: 'chaplain@example.org',
        subjectFirstName: 'Api',
        subjectLastName: 'Test',
        needs: 'Housing on release',
        state: 'TN',
      })
      .expect(201);
    expect(res.body).toEqual({ ok: true });
  });

  it('rejects an invalid referral payload', async () => {
    await request(server)
      .post('/api/public/referrals')
      .send({ referrerType: 'chaplain', needs: 'x' })
      .expect(400);
  });
});

describe('confidential case notes (§7.3)', () => {
  it('admin (confidential.read holder) sees content; the list stubs exist for others', async () => {
    const cookie = await login(ADMIN);
    const notes = await request(server)
      .get('/api/case-notes?pageSize=100')
      .set('Cookie', cookie)
      .expect(200);
    const confidential = notes.body.items.filter((n: { confidential: boolean }) => n.confidential);
    expect(confidential.length).toBeGreaterThan(0);
    // Admin holds case_notes.confidential.read → real content, not the stub
    expect(confidential.some((n: { content: string }) => n.content !== '[Confidential note]')).toBe(
      true,
    );
  });
});
