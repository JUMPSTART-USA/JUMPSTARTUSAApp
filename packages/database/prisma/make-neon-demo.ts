/**
 * Generates the pseudonymized demo dataset committed at
 * prisma/data/neon-demo.csv from a real NeonCRM export.
 *
 * The real export cannot be committed — it carries 119 donors' names, home
 * addresses and complete giving histories, and git history is forever. This
 * produces a file with the same *shape and statistics* and none of the
 * identities, so it is safe to commit and ships to staging inside the
 * migration image like any other seed data.
 *
 *   pnpm --filter @jumpstart/database make:neon-demo -- <real-export.csv>
 *
 * Deterministic: a fixed seed means rerunning on the same input produces a
 * byte-identical file, so regenerating does not churn the diff.
 *
 * REPLACED (identifying)          KEPT (what makes the demo realistic)
 *   donor and tribute names         gift dates, exactly
 *   street, city, ZIP               fund, campaign, tender type, purpose
 *   Neon account/donation ids       account type, postal state
 *   funder names inside funds       donor→gift structure and row counts
 *
 * Amounts are jittered ±15% and re-rounded. Exact amounts survive as quasi-
 * identifiers — a single $200,000 gift on a known date identifies its donor
 * to anyone who knows the organisation — while the distribution, magnitude
 * and per-chapter totals are preserved to within a few percent.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SEED = 0x5eed1234;

/** mulberry32 — small, fast, and deterministic across runs and platforms. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST = [
  'Alina','Bertram','Cordelia','Desmond','Elspeth','Fenwick','Giselle','Horace','Imogen','Jarrah',
  'Kestrel','Lachlan','Marisol','Nkemdi','Ottoline','Percival','Quillon','Rosalind','Soren','Tamsin',
  'Ulric','Verity','Wendell','Xiomara','Yolanda','Zephyr','Anwen','Barnaby','Clemency','Dorotea',
  'Edmund','Fionnuala','Grover','Hesper','Ignatius','Jessamy','Kendrick','Lorelei','Merrick','Nadira',
  'Oswin','Petra','Rafferty','Saffron','Thaddeus','Ursula','Vaughn','Winnifred','Yusra','Zebedee',
];
const LAST = [
  'Ashcombe','Brightwater','Cardew','Danforth','Ellwood','Fairbrother','Grimsby','Haverford','Ingleby','Jessop',
  'Kettleborough','Lindqvist','Marchbanks','Northcote','Oakhurst','Pemberton','Quarrington','Rutherford','Selby','Thorndike',
  'Underhill','Vance','Whitlock','Yarborough','Ziegler','Ballantyne','Cheswick','Drummond','Eastleigh','Falkirk',
  'Garrowby','Hollingsworth','Ivorson','Jardine','Kingsley','Langtry','Mowbray','Netherton','Ormsby','Prendergast',
];
const ORG_HEAD = ['Ashgrove','Bellrock','Cedarhill','Dunmore','Elmsworth','Fairhaven','Glenmoor','Harrowgate','Ironwood','Junipero','Kingsmere','Larkfield','Meadowbrook','Northfield','Oakvale','Pinehurst','Quarryhill','Riverstone','Stonebridge','Thornfield','Umberly','Voss','Westmark','Yewdale'];
const ORG_CHURCH = ['Chapel','Community Church','Fellowship','Baptist Church','Methodist Church','Presbyterian Church','Ministries'];
const ORG_FOUND = ['Family Foundation','Foundation','Charitable Trust','Family Trust'];
const ORG_BIZ = ['Holdings LLC','Industries Inc','Partners LLC','Contracting Co','Group Inc','& Sons Inc'];
const STREET = ['Alder','Birchwood','Cobblestone','Draycott','Elmshade','Foxglove','Gainsborough','Hazelmere','Inverness','Juniper','Kestrel','Larkspur','Mulberry','Nightingale','Orchard','Primrose','Quillfeather','Rosemary','Sycamore','Thistledown','Underwood','Verbena','Willowmere','Yarrow'];
const STREET_TYPE = ['Ln','Rd','Ave','St','Dr','Ct','Way','Ter'];
const CITY = ['Ashford','Brookvale','Clearmont','Danby','Eastbrook','Fairmount','Glenside','Hartwell','Ivyton','Jamesport','Kirkwood','Lindale','Maplecrest','Newbury','Oakmont','Parkdale','Ridgeway','Summerfield','Turnbull','Valeview','Westbrook','Yorkfield'];

/** Real ZIP prefixes so the state column stays plausible against the ZIP. */
const ZIP_PREFIX: Record<string, string> = {
  SC: '29', NC: '27', GA: '30', FL: '33', TX: '75', OH: '44', IL: '60', MO: '63',
  PA: '19', TN: '37', VA: '22', MI: '48', NY: '11', CA: '92', MD: '21', IN: '46',
};

/** Funder names embedded in fund labels are identities too. */
const FUND_RENAMES: Record<string, string> = {
  'Greenleaf Foundation': 'Ashgrove Foundation',
  'SCCF - SS': 'NRCF - SS',
  SCCF: 'NRCF',
};

// ------------------------------------------------------------------ csv io

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = '', quoted = false, i = 0;
  const end = () => { row.push(field); rows.push(row); row = []; field = ''; };
  while (i < text.length) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i += 2; continue; } quoted = false; i++; continue; }
      field += c; i++; continue;
    }
    if (c === '"') { quoted = true; i++; continue; }
    if (c === ',') { row.push(field); field = ''; i++; continue; }
    if (c === '\r') { end(); i += text[i + 1] === '\n' ? 2 : 1; continue; }
    if (c === '\n') { end(); i++; continue; }
    field += c; i++;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((f) => f.trim() !== ''));
}

const quote = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const toCsv = (rows: string[][]) => rows.map((r) => r.map(quote).join(',')).join('\n') + '\n';

// ------------------------------------------------------------------ main

const input = process.argv[2];
if (!input) throw new Error('Usage: make:neon-demo -- <real-export.csv>');

const rows = parseCsv(readFileSync(input, 'utf8').replace(/^﻿/, ''));
const [headers, ...body] = rows;
const at = (name: string) => headers.findIndex((h) => h.trim() === name);
const COL = {
  donationId: at('Donation ID'), accountId: at('Account ID'), amount: at('Donation Amount'),
  date: at('Donation Date'), accountType: at('Account Type'), fullName: at('Full Name (F)'),
  company: at('Company Name'), city: at('City'), address: at('Address Line 1'),
  state: at('State/Province'), zip: at('Zip Code'), campaign: at('Campaign Name'),
  purpose: at('Purpose'), fund: at('Fund'), tender: at('Tender Type'), tribute: at('Tribute Name'),
};

const rand = rng(SEED);
const pick = <T,>(arr: readonly T[]) => arr[Math.floor(rand() * arr.length)]!;

/**
 * Every ZIP that appears in the real export, so generated ones can avoid them.
 * A ZIP is not identifying on its own — it is a postal area of thousands, and
 * here it hangs off an invented name and street — but a clean zero-overlap
 * result is a far easier property to verify and to state than "some overlap,
 * all of it harmless".
 */
const realZips = new Set(body.map((r) => (r[COL.zip] ?? '').trim()).filter(Boolean));

/** One identity per real account, reused across all that account's gifts. */
interface Fake { accountId: string; person: string; company: string; city: string; address: string; zip: string }
const fakes = new Map<string, Fake>();
const usedNames = new Set<string>();

function uniquePerson(): string {
  for (let i = 0; i < 500; i++) {
    const n = `${pick(FIRST)} ${pick(LAST)}`;
    if (!usedNames.has(n)) { usedNames.add(n); return n; }
  }
  return `${pick(FIRST)} ${pick(LAST)} ${usedNames.size}`;
}

function uniqueOrg(kind: string): string {
  const tail = /church|chapel|ministr/i.test(kind) ? ORG_CHURCH
    : /foundation|trust/i.test(kind) ? ORG_FOUND
    : ORG_BIZ;
  for (let i = 0; i < 500; i++) {
    const n = `${pick(ORG_HEAD)} ${pick(tail)}`;
    if (!usedNames.has(n)) { usedNames.add(n); return n; }
  }
  return `${pick(ORG_HEAD)} ${pick(tail)} ${usedNames.size}`;
}

function makeZip(state: string): string {
  const prefix = ZIP_PREFIX[state.trim().toUpperCase()] ?? '10';
  for (let i = 0; i < 2000; i++) {
    const z = `${prefix}${String(Math.floor(rand() * 1000)).padStart(3, '0')}`;
    if (!realZips.has(z)) return z;
  }
  return `${prefix}000`;
}

function fakeFor(realId: string, realType: string, realCompany: string, state: string): Fake {
  const existing = fakes.get(realId);
  if (existing) return existing;
  const isCompany = realType.trim() === 'Company';
  const made: Fake = {
    accountId: `A${String(fakes.size + 1).padStart(4, '0')}`,
    person: uniquePerson(),
    // Individuals sometimes carry an employer in Company Name; keep that at a
    // similar rate so the importer's name-selection logic stays exercised.
    company: isCompany ? uniqueOrg(realCompany) : rand() < 0.45 ? uniqueOrg('business') : '',
    city: pick(CITY),
    address: `${1 + Math.floor(rand() * 8999)} ${pick(STREET)} ${pick(STREET_TYPE)}`,
    zip: makeZip(state),
  };
  fakes.set(realId, made);
  return made;
}

/** Jitter ±15%, then round to a scale-appropriate unit. */
function jitter(raw: string): string {
  const n = Number.parseFloat(raw.replace(/[$,\s]/g, ''));
  if (!Number.isFinite(n)) return raw; // preserves "N/A" rows
  const v = n * (0.85 + rand() * 0.3);
  const unit = v < 100 ? 5 : v < 1000 ? 25 : v < 10000 ? 100 : 1000;
  return (Math.max(unit, Math.round(v / unit) * unit)).toFixed(2);
}

const renameFund = (fund: string) =>
  Object.entries(FUND_RENAMES).reduce((acc, [from, to]) => acc.split(from).join(to), fund);

const out: string[][] = [[
  'Donation ID','Account ID','Donation Amount','Donation Date','Account Type','Full Name (F)',
  'Company Name','City','Address Line 1','State/Province','Zip Code','Campaign Name','Purpose',
  'Fund','Tender Type','Tribute Name',
]];

body.forEach((r, i) => {
  const g = (c: number) => (c >= 0 ? (r[c] ?? '').trim() : '');
  const state = g(COL.state);
  const f = fakeFor(g(COL.accountId), g(COL.accountType), g(COL.company), state);
  out.push([
    `D${String(i + 1).padStart(4, '0')}`,
    f.accountId,
    jitter(g(COL.amount)),
    g(COL.date),
    g(COL.accountType),
    f.person,
    f.company,
    f.city,
    f.address,
    state,
    state ? f.zip : '',
    g(COL.campaign),
    g(COL.purpose),
    renameFund(g(COL.fund)),
    g(COL.tender),
    g(COL.tribute) ? uniquePerson() : '',
  ]);
});

const dest = join(__dirname, 'data', 'neon-demo.csv');
writeFileSync(dest, toCsv(out), 'utf8');
console.log(`${out.length - 1} gift rows, ${fakes.size} donors -> ${dest}`);
