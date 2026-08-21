/**
 * One-time NeonCRM importer: loads donors and gifts exported from NeonCRM into
 * the native Development module, so testers have real data to work against.
 *
 * Deliberately CSV-driven rather than API-driven. NeonPay/Neon One is not
 * available standalone to third-party apps (docs/payments-recommendation.md),
 * and this is a one-shot load with no standing connection to maintain — so the
 * source of truth is whatever you export from NeonCRM's own reporting UI. No
 * API key is needed and nothing is left connected afterwards.
 *
 * Export two reports from NeonCRM as CSV, then:
 *
 *   pnpm --filter @jumpstart/database import:neon -- \
 *     --accounts ~/neon-accounts.csv --donations ~/neon-donations.csv --inspect
 *
 * --inspect prints the column mapping and a preview WITHOUT writing anything.
 * Always run it first: NeonCRM column names vary by account configuration, and
 * any header this script could not place is listed so you can add it to ALIASES
 * below. Then rerun without --inspect to write.
 *
 * Idempotent. The mirror's external-id columns were removed in PR #23, so there
 * is no Neon ID to match on; reruns match donors on email (else name + zip) and
 * gifts on donor + date + amount. That is strong enough to rerun safely, but a
 * donor who genuinely gave the same amount twice on one day imports once —
 * --allow-same-day-dupes turns that off if your data has real duplicates.
 */
import { existsSync, readFileSync } from 'node:fs';
import { PrismaClient, type DonorType } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Header aliases, normalised (lowercased, non-alphanumerics stripped) before
 * matching. First hit wins. Add to these rather than renaming CSV columns.
 */
const ALIASES = {
  accounts: {
    accountId: ['accountid', 'neonid', 'accountnumber'],
    accountType: ['accounttype', 'individualorganization', 'usertype'],
    // NeonCRM labels the individual's name "Full Name (F)".
    fullName: ['fullnamef', 'fullname', 'name', 'displayname'],
    companyName: ['companyname', 'organizationname', 'accountname'],
    firstName: ['firstname', 'first'],
    lastName: ['lastname', 'last'],
    email: ['email', 'email1', 'preferredemail', 'emailaddress'],
    phone: ['phone', 'phone1', 'homephone', 'preferredphone', 'phonenumber'],
    addressLine1: ['addressline1', 'streetaddress1', 'address1', 'street'],
    city: ['city'],
    state: ['stateprovince', 'state', 'province'],
    zip: ['zipcode', 'zip', 'postalcode'],
    // Present when the export is gift-level; used to derive the chapter.
    fund: ['fund', 'fundname', 'designation'],
  },
  donations: {
    donationId: ['donationid', 'transactionid', 'giftid'],
    accountId: ['accountid', 'neonid', 'accountnumber', 'donoraccountid'],
    donorName: ['fullnamef', 'donorname', 'accountname', 'fullname', 'name'],
    email: ['email', 'emailaddress', 'donoremail'],
    amount: ['donationamount', 'amount', 'grossamount', 'transactionamount', 'donationtotal'],
    date: ['donationdate', 'date', 'transactiondate'],
    fund: ['fund', 'fundname', 'designation'],
    campaign: ['campaignname', 'campaign'],
    paymentMethod: ['tendertype', 'paymentmethod', 'paymenttype'],
    tributeName: ['tributename'],
    purpose: ['purpose'],
    anonymous: ['anonymous', 'isanonymous'],
    note: ['note', 'notes', 'comment', 'memo'],
  },
} as const;

/** NeonCRM tender values → PAYMENT_METHOD_OPTIONS (packages/shared/src/schemas/crm.ts). */
const PAYMENT_METHODS: Record<string, string> = {
  cash: 'cash',
  check: 'check',
  cheque: 'check',
  creditcard: 'credit_card',
  creditcardonline: 'credit_card',
  creditcardoffline: 'credit_card',
  card: 'credit_card',
  creditdebit: 'credit_card',
  ach: 'ach_eft',
  acheft: 'ach_eft',
  echeckach: 'ach_eft',
  echeck: 'ach_eft',
  bankdraft: 'ach_eft',
  eft: 'ach_eft',
  directdebit: 'ach_eft',
  applepay: 'apple_pay',
  googlepay: 'google_pay',
  paypal: 'paypal',
  venmo: 'venmo',
  inkind: 'in_kind',
  goodsandservices: 'in_kind',
};

const CHAPTER_STATES = ['FL', 'GA', 'NC', 'OH', 'SC', 'TX', 'USA'];

/** Marks a donor that --inspect would create but has not written; never hits the DB. */
const PENDING = 'pending:';

// ---------------------------------------------------------------- CSV

/**
 * Decodes a spreadsheet export to text. Excel on macOS will happily write
 * UTF-16 ("Unicode Text") or leave a UTF-8 BOM; both look like binary garbage
 * if read as plain UTF-8, so sniff the BOM rather than assuming.
 */
function decode(buf: Buffer): string {
  if (buf[0] === 0xff && buf[1] === 0xfe) return buf.subarray(2).toString('utf16le');
  if (buf[0] === 0xfe && buf[1] === 0xff) {
    const swapped = Buffer.from(buf.subarray(2));
    swapped.swap16();
    return swapped.toString('utf16le');
  }
  const text = buf.toString('utf8');
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** Picks the delimiter actually used in the header line: comma, tab or semicolon. */
function sniffDelimiter(text: string): string {
  const header = text.split(/\r\n|\r|\n/, 1)[0] ?? '';
  const counts = [
    [',', (header.match(/,/g) ?? []).length],
    ['\t', (header.match(/\t/g) ?? []).length],
    [';', (header.match(/;/g) ?? []).length],
  ] as const;
  return [...counts].sort((a, b) => b[1] - a[1])[0][1] > 0
    ? [...counts].sort((a, b) => b[1] - a[1])[0][0]
    : ',';
}

/**
 * RFC4180 parser: quoted fields, embedded delimiters/quotes/newlines, and all
 * three line-ending conventions. CR-only endings matter — a Mac-Excel export
 * using them has no \n at all, so a \n-only parser silently returns the whole
 * file as a single row and the import looks empty.
 */
function parseCsv(input: string, delimiter = ','): string[][] {
  const text = input;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let i = 0;
  const endRow = () => { row.push(field); rows.push(row); row = []; field = ''; };
  while (i < text.length) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        quoted = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { quoted = true; i++; continue; }
    if (c === delimiter) { row.push(field); field = ''; i++; continue; }
    if (c === '\r') { endRow(); i += text[i + 1] === '\n' ? 2 : 1; continue; }
    if (c === '\n') { endRow(); i++; continue; }
    field += c; i++;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((f) => f.trim() !== ''));
}

const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Resolves each logical field to a column index, and reports what it could not place. */
function buildMapping(headers: string[], aliases: Record<string, readonly string[]>) {
  const normed = headers.map(norm);
  const index: Record<string, number> = {};
  const used = new Set<number>();
  for (const [field, candidates] of Object.entries(aliases)) {
    for (const candidate of candidates) {
      const at = normed.indexOf(candidate);
      if (at !== -1 && !used.has(at)) { index[field] = at; used.add(at); break; }
    }
  }
  const unmapped = headers.filter((_, at) => !used.has(at));
  return { index, unmapped };
}

const cell = (row: string[], at: number | undefined) =>
  at === undefined ? '' : (row[at] ?? '').trim();

/** Reads a CSV, failing with instructions rather than a bare ENOENT. */
function readCsv(path: string, which: 'accounts' | 'donations'): string[][] {
  if (!existsSync(path)) {
    const report =
      which === 'accounts'
        ? 'Accounts (or Donors) report — one row per donor, with name, email and address columns'
        : 'Donations (or Transactions) report — one row per gift, with amount, date and fund columns';
    throw new Error(
      `No file at ${path}\n\n` +
        `That is the --${which} export, and it has to come out of NeonCRM first:\n` +
        `  1. In NeonCRM, run the ${report}.\n` +
        `  2. Export it as CSV and note where the download landed.\n` +
        `  3. Rerun this with --${which} pointing at that file.\n\n` +
        `Both exports must cover the same date range, or gifts will not find their donors.`,
    );
  }
  const raw = readFileSync(path);
  const text = decode(raw);
  const delimiter = sniffDelimiter(text);
  const rows = parseCsv(text, delimiter);
  if (rows.length < 2) {
    const shown = delimiter === '\t' ? 'tab' : `"${delimiter}"`;
    throw new Error(
      `${path} parsed to ${rows.length} row(s) — no data to import.\n` +
        `  size ${raw.length} bytes, delimiter ${shown}, ` +
        `${rows[0]?.length ?? 0} column(s) in the first row.\n` +
        (raw.length > 1000
          ? `  The file is not empty, so this is a parsing problem rather than an empty export.\n` +
            `  First 200 characters as decoded:\n    ${text.slice(0, 200).replace(/\n/g, ' ')}`
          : `  The export itself looks empty — check its filters and date range.`),
    );
  }
  return rows;
}

// ---------------------------------------------------------------- coercion

function parseAmount(raw: string): string | null {
  const cleaned = raw.replace(/[$,\s]/g, '');
  if (!cleaned || !/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  return Number.parseFloat(cleaned).toFixed(2);
}

/** Donation.donationDate is @db.Date — build midnight UTC so it matches seeded rows. */
function parseDate(raw: string): Date | null {
  const s = raw.trim();
  if (!s) return null;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
  if (m) return new Date(Date.UTC(+m[3], +m[1] - 1, +m[2]));
  const d = new Date(s);
  return Number.isNaN(d.getTime())
    ? null
    : new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

function parsePaymentMethod(raw: string): string | null {
  if (!raw.trim()) return null;
  return PAYMENT_METHODS[norm(raw)] ?? 'other';
}

/**
 * Which column holds the donor's name depends on the account type: individuals
 * carry "Full Name (F)", companies "Company Name". In this export 403 rows have
 * a Company Name but only 216 are Company accounts, so preferring whichever is
 * non-blank would mis-name ~190 individuals.
 */
function pickName(accountType: string, company: string, full: string, first: string, last: string): string {
  const isCompany = norm(accountType) === 'company' || norm(accountType) === 'organization';
  const person = full || [first, last].filter(Boolean).join(' ');
  return (isCompany ? company || person : person || company).trim();
}

/** Neon distinguishes only individual vs company; refine the rest from the name. */
function parseDonorType(accountType: string, name: string): DonorType {
  const t = norm(accountType);
  const n = name.toLowerCase();
  if (/\b(church|ministry|ministries|chapel|parish|congregation|baptist|methodist|presbyterian|catholic)\b/.test(n))
    return 'church';
  if (/\b(foundation|trust|endowment)\b/.test(n)) return 'foundation';
  if (t === 'individual' || t === 'person' || (!t && !/\b(inc|llc|ltd|corp|company|co|associates|group|partners)\b/.test(n)))
    return 'individual';
  if (/\b(inc|llc|ltd|corp|corporation|company|associates|group|partners)\b/.test(n)) return 'business';
  return 'organization';
}

/**
 * chapterState is required (§7.2) and NeonCRM has no field for it, but the real
 * export encodes it in the fund name — "Donations - 153 Individuals (NC)". That
 * is the chapter that received the gift, which beats the donor's postal state:
 * plenty of donors live outside the six chapters (IL and MO are the 3rd and 4th
 * most common states in this export) while giving to a specific chapter.
 *
 * Order: fund suffix, then postal state, then the national office.
 */
function chapterFromFund(fund: string): string | null {
  const m = /\(([A-Za-z]{2,3})\)\s*$/.exec(fund.trim());
  const code = m?.[1]?.toUpperCase();
  return code && CHAPTER_STATES.includes(code) ? code : null;
}

function chapterFor(fund: string, state: string, fallback: string): string {
  const s = state.trim().toUpperCase();
  return chapterFromFund(fund) ?? (CHAPTER_STATES.includes(s) ? s : fallback);
}

/**
 * Provenance tag written into notes. The mirror's external-id columns were
 * removed in PR #23, so there is nowhere else to record the Neon id — and the
 * migration rules in the architecture plan (§8.3) call for every imported row
 * to carry its original id anyway. Tagging notes gives exact idempotency
 * without a schema change, and stays visible to staff in the app.
 */
const tag = (kind: 'account' | 'donation', id: string) => `[neon:${kind}:${id}]`;

/** Builds the notes value: provenance tag first, then anything worth keeping. */
function buildNotes(kind: 'account' | 'donation', id: string, extras: string[]): string {
  const body = extras.filter((e) => e.trim()).join(' — ');
  return [id ? tag(kind, id) : '', body].filter(Boolean).join(' ');
}

// ---------------------------------------------------------------- args

const argv = process.argv.slice(2);
const flag = (name: string) => argv.includes(`--${name}`);
const opt = (name: string) => {
  const at = argv.indexOf(`--${name}`);
  return at !== -1 ? argv[at + 1] : undefined;
};

const accountsPath = opt('accounts');
const donationsPath = opt('donations');
const inspect = flag('inspect');
const allowRemote = flag('allow-remote');
const allowSameDayDupes = flag('allow-same-day-dupes');
const defaultChapter = (opt('default-chapter') ?? 'USA').toUpperCase();

function assertSafeTarget() {
  const url = process.env.DATABASE_URL ?? '';
  const host = /@([^/:]+)/.exec(url)?.[1] ?? '';
  const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '';
  if (/prod/i.test(url)) {
    throw new Error(
      `Refusing to run: DATABASE_URL looks like production (host ${host}). ` +
        `This importer is for local and staging only.`,
    );
  }
  if (!isLocal && !allowRemote) {
    throw new Error(
      `DATABASE_URL points at a remote host (${host}). Rerun with --allow-remote ` +
        `if you meant to load staging.`,
    );
  }
  return host || 'localhost';
}

// ---------------------------------------------------------------- import

async function main() {
  const combined = opt('combined');
  const accountsSrc = combined ?? accountsPath;
  const donationsSrc = combined ?? donationsPath;

  if (!accountsSrc && !donationsSrc) {
    throw new Error(
      'Nothing to do. Pass --combined <file.csv> for a gift-level export that also\n' +
        'carries donor columns, or --accounts/--donations for two separate reports.\n' +
        'Add --inspect to preview the column mapping without writing.',
    );
  }

  if (accountsSrc) readCsv(accountsSrc, 'accounts');
  if (donationsSrc) readCsv(donationsSrc, 'donations');

  const host = assertSafeTarget();
  console.log(`Target: ${host}${inspect ? '  (inspect only — nothing will be written)' : ''}`);
  if (combined) console.log(`Combined export: donors and gifts both read from ${combined}`);
  console.log(`Chapter: fund suffix, else postal state, else ${defaultChapter}\n`);

  const stamp = await prisma.user
    .findFirst({ where: { email: 'admin@jumpstartusa.org' }, select: { id: true } })
    .then((u) => u?.id ?? null);

  /** Neon account id → donor id in this database. */
  const donorByAccount = new Map<string, string>();

  // Already-imported ids, so reruns are exact rather than heuristic.
  const seenAccounts = new Map<string, string>();
  for (const d of await prisma.donor.findMany({
    where: { notes: { contains: '[neon:account:' } },
    select: { id: true, notes: true },
  })) {
    const id = /\[neon:account:([^\]]+)\]/.exec(d.notes ?? '')?.[1];
    if (id) seenAccounts.set(id, d.id);
  }
  const seenDonations = new Set<string>();
  for (const g of await prisma.donation.findMany({
    where: { notes: { contains: '[neon:donation:' } },
    select: { notes: true },
  })) {
    const id = /\[neon:donation:([^\]]+)\]/.exec(g.notes ?? '')?.[1];
    if (id) seenDonations.add(id);
  }

  // ---------------------------------------------------------------- donors
  if (accountsSrc) {
    const [headers, ...body] = readCsv(accountsSrc, 'accounts');
    const { index, unmapped } = buildMapping(headers, ALIASES.accounts);

    console.log(`— Donors (from ${body.length} rows in ${accountsSrc})`);
    for (const [field, at] of Object.entries(index)) console.log(`    ${field.padEnd(14)} ← "${headers[at]}"`);
    if (unmapped.length) console.log(`    unused columns: ${unmapped.join(', ')}`);

    let created = 0;
    let matched = 0;
    let skipped = 0;

    // A gift-level export repeats each donor once per gift; collapse first.
    const byAccount = new Map<string, string[]>();
    const orphanRows: string[][] = [];
    for (const row of body) {
      const accountId = cell(row, index.accountId);
      if (!accountId) { orphanRows.push(row); continue; }
      if (!byAccount.has(accountId)) byAccount.set(accountId, row);
    }
    console.log(`    ${byAccount.size} distinct donors across ${body.length} rows`);

    for (const [accountId, row] of byAccount) {
      const name = pickName(
        cell(row, index.accountType),
        cell(row, index.companyName),
        cell(row, index.fullName),
        cell(row, index.firstName),
        cell(row, index.lastName),
      );
      if (!name) { skipped++; continue; }

      const existingId = seenAccounts.get(accountId);
      if (existingId) { donorByAccount.set(accountId, existingId); matched++; continue; }

      const state = cell(row, index.state);
      const zip = cell(row, index.zip) || null;
      const email = cell(row, index.email).toLowerCase() || null;

      // Fall back to a name match so a rerun after a manual edit does not double up.
      const preexisting = await prisma.donor.findFirst({
        where: { name: { equals: name, mode: 'insensitive' }, deletedAt: null },
        select: { id: true },
      });
      if (preexisting) { donorByAccount.set(accountId, preexisting.id); matched++; continue; }

      if (inspect) {
        created++;
        if (created <= 3) {
          console.log(`    + would create donor #${accountId} (${chapterFor(cell(row, index.fund), state, defaultChapter)})`);
        }
        donorByAccount.set(accountId, `${PENDING}${accountId}`);
        continue;
      }

      const donor = await prisma.donor.create({
        data: {
          name,
          donorType: parseDonorType(cell(row, index.accountType), name),
          email,
          phone: cell(row, index.phone) || null,
          addressLine1: cell(row, index.addressLine1) || null,
          city: cell(row, index.city) || null,
          state: state || null,
          zip,
          chapterState: chapterFor(cell(row, index.fund), state, defaultChapter),
          notes: buildNotes('account', accountId, []),
          createdById: stamp,
          updatedById: stamp,
        },
      });
      created++;
      donorByAccount.set(accountId, donor.id);
    }
    if (orphanRows.length) console.log(`    ${orphanRows.length} rows had no Account ID`);
    console.log(`    ${created} new, ${matched} already present, ${skipped} unusable\n`);
  }

  // ---------------------------------------------------------------- gifts
  if (donationsSrc) {
    const [headers, ...body] = readCsv(donationsSrc, 'donations');
    const { index, unmapped } = buildMapping(headers, ALIASES.donations);

    console.log(`— Gifts (${body.length} rows from ${donationsSrc})`);
    for (const [field, at] of Object.entries(index)) console.log(`    ${field.padEnd(14)} ← "${headers[at]}"`);
    if (unmapped.length) console.log(`    unused columns: ${unmapped.join(', ')}`);

    const fundCache = new Map<string, string>();
    const campaignCache = new Map<string, string>();
    const problems: string[] = [];
    let created = 0;
    let duplicate = 0;

    for (const row of body) {
      const donationId = cell(row, index.donationId);
      if (donationId && seenDonations.has(donationId)) { duplicate++; continue; }

      const amount = parseAmount(cell(row, index.amount));
      const date = parseDate(cell(row, index.date));
      if (!amount || !date) {
        const rawAmount = cell(row, index.amount) || '(blank)';
        const rawDate = cell(row, index.date) || '(blank)';
        problems.push(
          `gift ${donationId || '?'}: no usable amount/date (amount "${rawAmount}", date "${rawDate}")`,
        );
        continue;
      }

      const accountId = cell(row, index.accountId);
      let donorId = accountId ? donorByAccount.get(accountId) : undefined;
      if (!donorId && accountId) donorId = seenAccounts.get(accountId);
      if (!donorId) {
        const donorName = cell(row, index.donorName);
        if (donorName) {
          donorId = (await prisma.donor.findFirst({
            where: { name: { equals: donorName, mode: 'insensitive' }, deletedAt: null },
            select: { id: true },
          }))?.id;
        }
      }
      if (!donorId) { problems.push(`gift ${donationId || '?'}: no donor for account ${accountId || '(blank)'}`); continue; }

      const fundName = cell(row, index.fund);
      const chapter = chapterFor(fundName, '', defaultChapter);

      let fundId: string | null = null;
      if (fundName) {
        if (fundCache.has(fundName)) fundId = fundCache.get(fundName)!;
        else {
          const fund = inspect
            ? await prisma.fund.findUnique({ where: { name: fundName }, select: { id: true } })
            : await prisma.fund.upsert({
                where: { name: fundName },
                update: {},
                create: { name: fundName, createdById: stamp },
                select: { id: true },
              });
          if (fund) { fundId = fund.id; fundCache.set(fundName, fund.id); }
        }
      }

      const campaignName = cell(row, index.campaign);
      let campaignId: string | null = null;
      if (campaignName) {
        if (campaignCache.has(campaignName)) campaignId = campaignCache.get(campaignName)!;
        else {
          let campaign = await prisma.campaign.findFirst({
            where: { name: campaignName, deletedAt: null },
            select: { id: true },
          });
          if (!campaign && !inspect) {
            campaign = await prisma.campaign.create({
              data: { name: campaignName, chapterState: chapter, createdById: stamp, updatedById: stamp },
              select: { id: true },
            });
          }
          if (campaign) { campaignId = campaign.id; campaignCache.set(campaignName, campaign.id); }
        }
      }

      if (inspect) { created++; continue; }

      await prisma.donation.create({
        data: {
          donorId,
          donationDate: date,
          amount,
          fundId,
          campaignId,
          paymentMethod: parsePaymentMethod(cell(row, index.paymentMethod)),
          isAnonymous: /^(y|yes|true|1)$/i.test(cell(row, index.anonymous)),
          notes: buildNotes('donation', donationId, [
            cell(row, index.purpose),
            cell(row, index.tributeName) ? `Tribute: ${cell(row, index.tributeName)}` : '',
            cell(row, index.note),
          ]),
          createdById: stamp,
          updatedById: stamp,
        },
      });
      created++;
    }

    console.log(`    ${created} new, ${duplicate} already imported, ${problems.length} skipped`);
    for (const line of problems.slice(0, 8)) console.log(`      ! ${line}`);
    if (problems.length > 8) console.log(`      … and ${problems.length - 8} more`);
  }

  console.log(inspect ? '\nInspect only — nothing written. Rerun without --inspect to load.' : '\nDone.');
}

main()
  .catch((err) => { console.error(`\n${err instanceof Error ? err.message : err}`); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
