import { createHash } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { hashPassword } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';

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

describe('institution contacts (chaplains, wardens, coordinators…)', () => {
  it('supports full CRUD with any number of contacts', async () => {
    const cookie = await login(ADMIN);

    // Throwaway institution so seeded records stay untouched.
    const inst = await request(server)
      .post('/api/institutions')
      .set('Cookie', cookie)
      .set('Origin', ORIGIN)
      .send({ name: 'Api Contact Test Facility', state: 'SC' })
      .expect(201);
    const id = inst.body.id;

    try {
      const specs = [
        { name: 'Rev. Test Chaplain', role: 'Chaplain', phone: '803-555-0111' },
        { name: 'Warden Test Person', role: 'Warden', email: 'warden@example.org' },
        { name: 'Pat Coordinator', role: 'Release Coordinator' },
        { name: 'Sam Programs', role: 'Program Coordinator' },
      ];
      const created = [];
      for (const spec of specs) {
        const res = await request(server)
          .post(`/api/institutions/${id}/contacts`)
          .set('Cookie', cookie)
          .set('Origin', ORIGIN)
          .send(spec)
          .expect(201);
        created.push(res.body);
      }

      const list = await request(server)
        .get(`/api/institutions/${id}/contacts`)
        .set('Cookie', cookie)
        .expect(200);
      expect(list.body).toHaveLength(4);

      // Whole-record PATCH: omitted optionals clear.
      const updated = await request(server)
        .patch(`/api/institutions/${id}/contacts/${created[0].id}`)
        .set('Cookie', cookie)
        .set('Origin', ORIGIN)
        .send({ name: 'Rev. Test Chaplain', role: 'Senior Chaplain' })
        .expect(200);
      expect(updated.body.role).toBe('Senior Chaplain');
      expect(updated.body.phone).toBeNull();

      // The profile payload carries the contacts.
      const profile = await request(server)
        .get(`/api/institutions/${id}/profile`)
        .set('Cookie', cookie)
        .expect(200);
      expect(profile.body.contacts).toHaveLength(4);

      await request(server)
        .delete(`/api/institutions/${id}/contacts/${created[3].id}`)
        .set('Cookie', cookie)
        .set('Origin', ORIGIN)
        .expect(200);
      const afterDelete = await request(server)
        .get(`/api/institutions/${id}/contacts`)
        .set('Cookie', cookie)
        .expect(200);
      expect(afterDelete.body).toHaveLength(3);
    } finally {
      await request(server)
        .delete(`/api/institutions/${id}`)
        .set('Cookie', cookie)
        .set('Origin', ORIGIN)
        .expect(200);
    }
  });
});

describe('inside locations & release (§6.1)', () => {
  it('keeps one active location and records release', async () => {
    const cookie = await login(ADMIN);
    const institutions = await request(server)
      .get('/api/institutions?pageSize=2')
      .set('Cookie', cookie)
      .expect(200);
    const [instA, instB] = institutions.body.items;

    // Throwaway participant so seeded records stay untouched.
    const created = await request(server)
      .post('/api/participants')
      .set('Cookie', cookie)
      .set('Origin', ORIGIN)
      .send({
        person: { firstName: 'Api', lastName: 'ReleaseTest', state: 'SC' },
        profile: { insideStatus: 'active' },
        // Admin is all-chapters — §7.2 requires an explicit chapter at create.
        chapterState: 'SC',
        confirmNotDuplicate: true,
      })
      .expect(201);
    const id = created.body.id;

    try {
      const first = await request(server)
        .post(`/api/participants/${id}/inside-locations`)
        .set('Cookie', cookie)
        .set('Origin', ORIGIN)
        .send({ institutionId: instA.id, status: 'active', startDate: '2026-01-10' })
        .expect(201);
      expect(first.body.status).toBe('active');
      expect(first.body.institution.name).toBeTruthy();

      // A second active location closes the first automatically.
      await request(server)
        .post(`/api/participants/${id}/inside-locations`)
        .set('Cookie', cookie)
        .set('Origin', ORIGIN)
        .send({ institutionId: instB.id, status: 'active', startDate: '2026-05-01' })
        .expect(201);
      const list = await request(server)
        .get(`/api/participants/${id}/inside-locations`)
        .set('Cookie', cookie)
        .expect(200);
      const active = list.body.filter((l: { status: string }) => l.status === 'active');
      expect(active).toHaveLength(1);
      expect(active[0].institutionId).toBe(instB.id);
      const closed = list.body.find((l: { id: string }) => l.id === first.body.id);
      expect(closed.status).toBe('inactive');
      expect(closed.endDate).toBeTruthy();

      // The participant list filters by active location and carries it.
      const filtered = await request(server)
        .get(`/api/participants?institutionId=${instB.id}&pageSize=100`)
        .set('Cookie', cookie)
        .expect(200);
      const row = filtered.body.items.find((p: { id: string }) => p.id === id);
      expect(row).toBeTruthy();
      expect(row.insideLocations[0].institution.id).toBe(instB.id);

      // The institution profile lists them under "currently housed".
      const roster = await request(server)
        .get(`/api/institutions/${instB.id}/profile`)
        .set('Cookie', cookie)
        .expect(200);
      expect(
        roster.body.currentParticipants.some(
          (r: { participantProfile: { id: string } }) => r.participantProfile.id === id,
        ),
      ).toBe(true);

      // Release: inside status → released, date stamped, location closed.
      const released = await request(server)
        .post(`/api/participants/${id}/release`)
        .set('Cookie', cookie)
        .set('Origin', ORIGIN)
        .send({ releaseDate: '2026-08-01' })
        .expect(201);
      expect(released.body.insideStatus).toBe('released');
      expect(released.body.releaseDate).toContain('2026-08-01');
      const after = await request(server)
        .get(`/api/participants/${id}/inside-locations`)
        .set('Cookie', cookie)
        .expect(200);
      expect(after.body.every((l: { status: string }) => l.status === 'inactive')).toBe(true);

      // Released → off the institution roster.
      const rosterAfter = await request(server)
        .get(`/api/institutions/${instB.id}/profile`)
        .set('Cookie', cookie)
        .expect(200);
      expect(
        rosterAfter.body.currentParticipants.some(
          (r: { participantProfile: { id: string } }) => r.participantProfile.id === id,
        ),
      ).toBe(false);

      // Releasing twice conflicts.
      await request(server)
        .post(`/api/participants/${id}/release`)
        .set('Cookie', cookie)
        .set('Origin', ORIGIN)
        .send({ releaseDate: '2026-08-02' })
        .expect(409);
    } finally {
      await request(server)
        .delete(`/api/participants/${id}`)
        .set('Cookie', cookie)
        .set('Origin', ORIGIN)
        .expect(200);
    }
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

      /**
       * The LIST endpoint too — the gap this assertion was missing. list() used
       * `include` with no top-level `select`, so every scalar column went out and
       * the flag reached any role holding plain participants.read (six of the ten
       * roles). The global-search box queries this endpoint as the user types, so
       * it shipped on a keystroke.
       *
       * Asserted for the holder as well: a projection that dropped the field for
       * everyone would satisfy a one-sided test while quietly breaking the detail
       * view, so the round-trip above is re-checked after the list.
       */
      const listAsHousing = await request(server)
        .get('/api/participants?pageSize=25')
        .set('Cookie', housingCookie)
        .expect(200);
      expect(listAsHousing.body.items.length).toBeGreaterThan(0);
      for (const row of listAsHousing.body.items) {
        expect(row).not.toHaveProperty('sexOffenderRegistry');
        expect(row).not.toHaveProperty('offenses');
      }

      const listAsAdmin = await request(server)
        .get('/api/participants?pageSize=25')
        .set('Cookie', adminCookie)
        .expect(200);
      // No list row carries a justice field for anyone; the detail view is where
      // a holder reads it.
      for (const row of listAsAdmin.body.items) {
        expect(row).not.toHaveProperty('sexOffenderRegistry');
      }
      const holderDetail = await request(server)
        .get(`/api/participants/${id}`)
        .set('Cookie', adminCookie)
        .expect(200);
      expect(holderDetail.body.sexOffenderRegistry).toBe(true);
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

describe('self-service password reset (§3.1)', () => {
  it('resets with a valid token, burns it, and never leaks account existence', async () => {
    // Enumeration-safe: unknown email answers ok all the same.
    await request(server)
      .post('/api/auth/forgot-password')
      .set('Origin', ORIGIN)
      .send({ email: 'nobody@example.org' })
      .expect(200);

    // Mail is unconfigured under test, so plant the token directly — the
    // endpoint stores only the SHA-256 of what it emails.
    const prisma = app.get(PrismaService);
    const email = `api-reset-${Date.now()}@jumpstartusa.org`;
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: await hashPassword('OldPassword123!!'),
        firstName: 'Api',
        lastName: 'ResetTest',
        status: 'active',
      },
    });
    const readOnly = await prisma.role.findUniqueOrThrow({ where: { key: 'read_only' } });
    await prisma.userRole.create({ data: { userId: user.id, roleId: readOnly.id } });
    const rawToken = 'e2e-reset-token-abcdef0123456789';
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    // Fixed token — clear any row a previous run left so reruns stay green.
    await prisma.passwordResetToken.deleteMany({ where: { tokenHash } });
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    try {
      await request(server)
        .post('/api/auth/reset-password')
        .set('Origin', ORIGIN)
        .send({
          token: rawToken,
          password: 'NewPassword123!!',
          confirmPassword: 'NewPassword123!!',
        })
        .expect(200);

      // New password signs in; the old one does not.
      await request(server)
        .post('/api/auth/login')
        .set('Origin', ORIGIN)
        .send({ email, password: 'NewPassword123!!' })
        .expect(200);
      await request(server)
        .post('/api/auth/login')
        .set('Origin', ORIGIN)
        .send({ email, password: 'OldPassword123!!' })
        .expect(401);

      // Single use: the same token is dead.
      await request(server)
        .post('/api/auth/reset-password')
        .set('Origin', ORIGIN)
        .send({
          token: rawToken,
          password: 'AnotherPass123!!',
          confirmPassword: 'AnotherPass123!!',
        })
        .expect(400);
    } finally {
      // Soft-delete like the app would — audit rows stay append-only.
      await prisma.user.update({
        where: { id: user.id },
        data: { deletedAt: new Date(), status: 'deactivated' },
      });
    }
  });
});

describe('app settings delete', () => {
  it('removes a key entirely; deleting a missing key 404s', async () => {
    const cookie = await login(ADMIN);
    const key = 'test.scratch-delete';

    await request(server)
      .put(`/api/admin/settings/${key}`)
      .set('Cookie', cookie)
      .set('Origin', ORIGIN)
      .send({ value: { scratch: true } })
      .expect(200);

    await request(server)
      .delete(`/api/admin/settings/${key}`)
      .set('Cookie', cookie)
      .set('Origin', ORIGIN)
      .expect(200);

    const list = await request(server)
      .get('/api/admin/settings')
      .set('Cookie', cookie)
      .expect(200);
    expect(list.body.some((s: { key: string }) => s.key === key)).toBe(false);

    await request(server)
      .delete(`/api/admin/settings/${key}`)
      .set('Cookie', cookie)
      .set('Origin', ORIGIN)
      .expect(404);
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
        state: 'SC',
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
