import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The companion to route-protection.spec.ts, for the other thing that is
 * enforced by convention rather than by the type system.
 *
 * route-protection asserts that every handler declares a permission. This
 * asserts the chapter half: a service that touches `chapterState` has to
 * ENGAGE with the scoping helpers rather than reading or writing the column on
 * its own. §7.2 is a record-level rule applied by hand in ~53 services, and the
 * failure mode is silent — a new module that filters on everything except the
 * chapter returns another chapter's records and every test still passes.
 *
 * A heuristic, deliberately. It cannot prove the scoping is CORRECT; the e2e
 * suite does that for the paths it covers. What it catches is the case that
 * has no other alarm attached to it: a service that handles chapter data while
 * appearing not to know chapters exist.
 */

const MODULES_DIR = path.join(__dirname, '..', 'src', 'modules');

function serviceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return serviceFiles(full);
    return entry.name.endsWith('.service.ts') ? [full] : [];
  });
}

/**
 * Any of these counts as engaging with the rule: asserting access to an
 * existing record, stamping a new one, or filtering a list by the caller's
 * chapter. Which one is right depends on the operation — that is a judgement
 * for the module, not for this scan.
 */
const SCOPING_HELPERS = [
  'assertChapterAccess',
  'resolveCreateChapter',
  'user.chapter',
  'userChapter',
  'viewer.chapter',
];

describe('services that touch chapterState engage with chapter scoping (§7.2)', () => {
  const files = serviceFiles(MODULES_DIR);

  it('finds the services to check, so an empty pass cannot look like success', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    if (!source.includes('chapterState')) continue;

    it(path.relative(MODULES_DIR, file), () => {
      const engaged = SCOPING_HELPERS.filter((helper) => source.includes(helper));
      expect(
        engaged,
        `${path.basename(file)} reads or writes chapterState but never uses a scoping ` +
          `helper (${SCOPING_HELPERS.join(', ')}). Either scope it, or — if the ` +
          `operation is genuinely chapter-neutral — say so in a comment and add it here.`,
      ).not.toHaveLength(0);
    });
  }
});
