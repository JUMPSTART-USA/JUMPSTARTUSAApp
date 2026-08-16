import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * No script may print a credential to stdout.
 *
 * seed-production.ts generated a temporary admin password and logged it. That
 * output does not vanish with the terminal — the script runs as a container
 * job, so it went into Azure Container Instance logs and stayed there. A live
 * production administrator password was found three weeks later, still sitting
 * in a completed container, readable by anyone with Reader on the resource
 * group.
 *
 * The lesson generalises past that one line: a credential written to stdout is
 * a credential written to every log aggregator, CI transcript and container
 * record downstream of it. This scans for the shape rather than trusting
 * anyone to remember.
 */

const SCRIPT_DIRS = [
  path.join(__dirname, '..', '..', '..', 'packages', 'database', 'prisma'),
  path.join(__dirname, '..', '..', '..', 'packages', 'database', 'scripts'),
];

/**
 * Interpolating a variable whose name looks like a secret into console output.
 *
 * `.*` and not `[^)]*` between the call and the `${`: the first version of this
 * used `[^)]*`, which cannot cross a closing paren — so the very line that
 * prompted this test,
 *
 *   console.log(`  Temporary password (shown once): ${password}`)
 *
 * sailed past it, stopped by the ")" in "(shown once)". The test passed against
 * the vulnerable code. Scanning is line-based, so `.*` is safe here.
 */
const PRINTS_SECRET =
  /console\.(log|info|warn|error)\(.*\$\{[^}]*(password|secret|token|apiKey|credential)[^}]*\}/i;

/** ...or passing one as a bare argument: console.log(temporaryPassword). */
const PRINTS_SECRET_ARG =
  /console\.(log|info|warn|error)\(\s*[A-Za-z_$][\w$]*(password|secret|token|credential)[\w$]*\s*[),]/i;

/**
 * The ONE exemption, named rather than pattern-excluded so it stays visible.
 *
 * The dev seed prints a FIXED, documented demo password for a disposable
 * local/CI database that holds no real data. That is developer ergonomics, not
 * a leak: there is nothing to compromise, and the value is a constant in the
 * file rather than a generated secret. Every other script is held to the rule.
 *
 * Do NOT add to this list to silence a failure. If a script needs to hand a
 * real credential to a human, email it or have the operator supply it.
 */
const DEMO_ONLY_FIXTURES = new Set(['seed.ts']);

function scriptFiles(dir: string): string[] {
  let entries: import('node:fs').Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true, encoding: 'utf8' });
  } catch {
    return [];
  }
  return entries.flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return scriptFiles(full);
    return e.name.endsWith('.ts') ? [full] : [];
  });
}

describe('no script prints a credential to stdout', () => {
  const files = SCRIPT_DIRS.flatMap(scriptFiles);

  it('finds the scripts to check, so an empty pass cannot look like success', () => {
    expect(files.length).toBeGreaterThan(3);
  });

  for (const file of files) {
    it(path.basename(file), (ctx) => {
      if (DEMO_ONLY_FIXTURES.has(path.basename(file))) return ctx.skip();
      const lines = readFileSync(file, 'utf8').split('\n');
      const offenders: string[] = [];

      lines.forEach((line, i) => {
        // Comments describing the rule are not violations of it.
        const code = line.replace(/^\s*(\/\/|\*|\/\*).*$/, '');
        if (PRINTS_SECRET.test(code) || PRINTS_SECRET_ARG.test(code)) {
          offenders.push(`line ${i + 1}: ${line.trim()}`);
        }
      });

      expect(
        offenders,
        `${path.basename(file)} appears to print a credential:\n${offenders.join('\n')}\n\n` +
          `stdout reaches container logs, CI transcripts and log aggregators, and stays ` +
          `there. Email it, or have the operator supply it as a secure variable.`,
      ).toEqual([]);
    });
  }
});
