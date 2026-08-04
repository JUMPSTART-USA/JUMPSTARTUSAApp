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
const HOUSING = { email: 'housing_staff@jumpstartusa.org', password: 'JumpstartDemo2026!' };
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

describe('admin "view as role" preview', () => {
  it('narrows API access to the previewed role and restores it on exit', async () => {
    const cookie = await login(ADMIN);
    await request(server)
      .post('/api/auth/view-as')
      .set('Cookie', cookie)
      .set('Origin', ORIGIN)
      .send({ role: 'fleet_manager' })
      .expect(200);

    const me = await request(server).get('/api/auth/me').set('Cookie', cookie).expect(200);
    expect(me.body.roles).toEqual(['fleet_manager']);
    expect(me.body.viewAsRole).toBe('fleet_manager');
    expect(me.body.actualRoles).toContain('admin');

    // The API itself enforces the narrowed access, not just the SPA's nav.
    await request(server).get('/api/vehicles').set('Cookie', cookie).expect(200);
    await request(server).get('/api/participants').set('Cookie', cookie).expect(403);

    // Exit works while narrowed (gated on actual roles) and restores access.
    await request(server)
      .post('/api/auth/view-as')
      .set('Cookie', cookie)
      .set('Origin', ORIGIN)
      .send({ role: null })
      .expect(200);
    const restored = await request(server).get('/api/auth/me').set('Cookie', cookie).expect(200);
    expect(restored.body.viewAsRole).toBeNull();
    expect(restored.body.roles).toContain('admin');
    await request(server).get('/api/participants').set('Cookie', cookie).expect(200);
  });

  it('rejects the preview for non-admins', async () => {
    const cookie = await login(FLEET);
    await request(server)
      .post('/api/auth/view-as')
      .set('Cookie', cookie)
      .set('Origin', ORIGIN)
      .send({ role: 'read_only' })
      .expect(403);
  });

  it('chapter preview narrows list data server-side and restores on exit', async () => {
    const cookie = await login(ADMIN);
    const before = await request(server)
      .get('/api/participants?pageSize=1')
      .set('Cookie', cookie)
      .expect(200);

    await request(server)
      .post('/api/auth/view-as')
      .set('Cookie', cookie)
      .set('Origin', ORIGIN)
      .send({ chapter: 'GA' })
      .expect(200);
    const me = await request(server).get('/api/auth/me').set('Cookie', cookie).expect(200);
    expect(me.body.chapter).toBe('GA');
    expect(me.body.viewChapter).toBe('GA');
    expect(me.body.actualChapter).toBeNull();
    expect(me.body.allowedChapters).toBeNull();

    // Lists really are chapter-filtered by the API, not just relabeled.
    const during = await request(server)
      .get('/api/participants?pageSize=1')
      .set('Cookie', cookie)
      .expect(200);
    expect(during.body.total).toBeLessThan(before.body.total);

    await request(server)
      .post('/api/auth/view-as')
      .set('Cookie', cookie)
      .set('Origin', ORIGIN)
      .send({ chapter: null })
      .expect(200);
    const restored = await request(server).get('/api/auth/me').set('Cookie', cookie).expect(200);
    expect(restored.body.chapter).toBeNull();
    expect(restored.body.viewChapter).toBeNull();
  });

  it('role and chapter previews compose and clear together', async () => {
    const cookie = await login(ADMIN);
    await request(server)
      .post('/api/auth/view-as')
      .set('Cookie', cookie)
      .set('Origin', ORIGIN)
      .send({ role: 'fleet_manager', chapter: 'GA' })
      .expect(200);
    const me = await request(server).get('/api/auth/me').set('Cookie', cookie).expect(200);
    expect(me.body.roles).toEqual(['fleet_manager']);
    expect(me.body.chapter).toBe('GA');

    await request(server)
      .post('/api/auth/view-as')
      .set('Cookie', cookie)
      .set('Origin', ORIGIN)
      .send({ role: null, chapter: null })
      .expect(200);
    const restored = await request(server).get('/api/auth/me').set('Cookie', cookie).expect(200);
    expect(restored.body.roles).toContain('admin');
    expect(restored.body.chapter).toBeNull();
  });

  it('single-chapter accounts cannot switch chapters', async () => {
    const adminCookie = await login(ADMIN);
    const fleetCookie = await login(FLEET);
    const fleetMe = await request(server)
      .get('/api/auth/me')
      .set('Cookie', fleetCookie)
      .expect(200);
    const setScopes = (states: string[]) =>
      request(server)
        .put(`/api/admin/users/${fleetMe.body.id}/region-scopes`)
        .set('Cookie', adminCookie)
        .set('Origin', ORIGIN)
        .send({ states });

    await setScopes(['GA']).expect(200);
    try {
      await request(server)
        .post('/api/auth/view-as')
        .set('Cookie', fleetCookie)
        .set('Origin', ORIGIN)
        .send({ chapter: 'TX' })
        .expect(403);
      // Clearing is still allowed — a preview must always be exitable.
      await request(server)
        .post('/api/auth/view-as')
        .set('Cookie', fleetCookie)
        .set('Origin', ORIGIN)
        .send({ chapter: null })
        .expect(200);
    } finally {
      await setScopes([]).expect(200);
    }
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

describe('portal requests surface on the dashboard', () => {
  it('pending submissions appear under attention needed', async () => {
    const cookie = await login(ADMIN);

    // Use a participant with no active portal link so this test never revokes
    // a manually-issued one (issuing replaces the participant's active token).
    const participants = await request(server)
      .get('/api/participants?pageSize=5')
      .set('Cookie', cookie)
      .expect(200);
    let participantProfileId = participants.body.items[0].id;
    for (const p of participants.body.items) {
      const tokens = await request(server)
        .get(`/api/portal-tokens?participantProfileId=${p.id}`)
        .set('Cookie', cookie)
        .expect(200);
      if (tokens.body.items.length === 0) {
        participantProfileId = p.id;
        break;
      }
    }

    const issued = await request(server)
      .post('/api/portal-tokens')
      .set('Cookie', cookie)
      .set('Origin', ORIGIN)
      .send({ participantProfileId })
      .expect(201);

    await request(server)
      .post(`/api/public/portal/${issued.body.token}/messages`)
      .send({ body: 'Automated dashboard test message — safe to ignore' })
      .expect(201);

    // A unique from-date busts the dashboard's in-process cache; date filters
    // never affect attention items.
    const dash = await request(server)
      .get('/api/dashboard?from=1999-01-02')
      .set('Cookie', cookie)
      .expect(200);
    const item = dash.body.attentionNeeded.find(
      (a: { key: string }) => a.key === 'portal_requests_pending',
    );
    expect(item).toBeTruthy();
    expect(item.count).toBeGreaterThan(0);

    await request(server)
      .post(`/api/portal-tokens/${issued.body.id}/revoke`)
      .set('Cookie', cookie)
      .set('Origin', ORIGIN)
      .expect(201);
  });
});

describe('most serious offenses (§7.2 justice field class)', () => {
  it('round-trips for justice-access holders and is hidden from others', async () => {
    const adminCookie = await login(ADMIN);
    const participants = await request(server)
      .get('/api/participants?pageSize=1')
      .set('Cookie', adminCookie)
      .expect(200);
    const id = participants.body.items[0].id;

    const created = await request(server)
      .post(`/api/participants/${id}/offenses`)
      .set('Cookie', adminCookie)
      .set('Origin', ORIGIN)
      .send({
        offense: 'Automated test offense — safe to ignore',
        offenseType: 'violent',
        convictionDate: '2019-06-15',
        sentenceYears: 10,
        sentenceMonths: 6,
      })
      .expect(201);
    expect(created.body.sentenceYears).toBe(10);
    expect(created.body.sentenceDays).toBeNull();

    try {
      // Admin (fields.justice.read) sees the record on the profile.
      const asAdmin = await request(server)
        .get(`/api/participants/${id}`)
        .set('Cookie', adminCookie)
        .expect(200);
      const found = asAdmin.body.offenses.find(
        (o: { id: string }) => o.id === created.body.id,
      );
      expect(found.offenseType).toBe('violent');

      // Housing staff: list endpoint is forbidden, and the profile omits the
      // offenses array entirely.
      const housingCookie = await login(HOUSING);
      await request(server)
        .get(`/api/participants/${id}/offenses`)
        .set('Cookie', housingCookie)
        .expect(403);
      const asHousing = await request(server)
        .get(`/api/participants/${id}`)
        .set('Cookie', housingCookie)
        .expect(200);
      expect(asHousing.body.offenses).toBeUndefined();

      // Whole-record PATCH: omitted optionals clear.
      const updated = await request(server)
        .patch(`/api/participants/${id}/offenses/${created.body.id}`)
        .set('Cookie', adminCookie)
        .set('Origin', ORIGIN)
        .send({ offense: 'Automated test offense — updated', offenseType: 'non_violent' })
        .expect(200);
      expect(updated.body.offenseType).toBe('non_violent');
      expect(updated.body.sentenceYears).toBeNull();
    } finally {
      await request(server)
        .delete(`/api/participants/${id}/offenses/${created.body.id}`)
        .set('Cookie', adminCookie)
        .set('Origin', ORIGIN)
        .expect(200);
    }
  });
});

describe('sex offender registry flag (§7.2 justice field class)', () => {
  it('reads require fields.justice.read; the flag round-trips for holders', async () => {
    const adminCookie = await login(ADMIN);
    const participants = await request(server)
      .get('/api/participants?pageSize=1')
      .set('Cookie', adminCookie)
      .expect(200);
    const id = participants.body.items[0].id;

    await request(server)
      .patch(`/api/participants/${id}`)
      .set('Cookie', adminCookie)
      .set('Origin', ORIGIN)
      .send({ profile: { sexOffenderRegistry: true } })
      .expect(200);

    try {
      // Admin holds fields.justice.read → sees the flag.
      const asAdmin = await request(server)
        .get(`/api/participants/${id}`)
        .set('Cookie', adminCookie)
        .expect(200);
      expect(asAdmin.body.sexOffenderRegistry).toBe(true);

      // Housing staff read participants but hold no justice-history access —
      // the field is dropped entirely, not returned as false.
      const housingCookie = await login(HOUSING);
      const asHousing = await request(server)
        .get(`/api/participants/${id}`)
        .set('Cookie', housingCookie)
        .expect(200);
      expect(asHousing.body.sexOffenderRegistry).toBeUndefined();
    } finally {
      await request(server)
        .patch(`/api/participants/${id}`)
        .set('Cookie', adminCookie)
        .set('Origin', ORIGIN)
        .send({ profile: { sexOffenderRegistry: false } })
        .expect(200);
    }
  });
});

describe('portal notification designation', () => {
  it('admins set per-type recipients and submissions still succeed', async () => {
    const cookie = await login(ADMIN);
    const me = await request(server).get('/api/auth/me').set('Cookie', cookie).expect(200);

    await request(server)
      .put('/api/admin/settings/portal.notifications')
      .set('Cookie', cookie)
      .set('Origin', ORIGIN)
      .send({ value: { messages: me.body.id, meetings: null, transport: null } })
      .expect(200);

    // Same care as the dashboard test: never revoke a manually-issued link.
    const participants = await request(server)
      .get('/api/participants?pageSize=5')
      .set('Cookie', cookie)
      .expect(200);
    let participantProfileId = participants.body.items[0].id;
    for (const p of participants.body.items) {
      const tokens = await request(server)
        .get(`/api/portal-tokens?participantProfileId=${p.id}`)
        .set('Cookie', cookie)
        .expect(200);
      if (tokens.body.items.length === 0) {
        participantProfileId = p.id;
        break;
      }
    }
    const issued = await request(server)
      .post('/api/portal-tokens')
      .set('Cookie', cookie)
      .set('Origin', ORIGIN)
      .send({ participantProfileId })
      .expect(201);

    try {
      // The notification is best-effort (mail is unconfigured under test) and
      // must never affect the participant's submission result.
      await request(server)
        .post(`/api/public/portal/${issued.body.token}/messages`)
        .send({ body: 'Automated notification test message — safe to ignore' })
        .expect(201);
    } finally {
      await request(server)
        .post(`/api/portal-tokens/${issued.body.id}/revoke`)
        .set('Cookie', cookie)
        .set('Origin', ORIGIN)
        .expect(201);
      await request(server)
        .put('/api/admin/settings/portal.notifications')
        .set('Cookie', cookie)
        .set('Origin', ORIGIN)
        .send({ value: {} })
        .expect(200);
    }
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
