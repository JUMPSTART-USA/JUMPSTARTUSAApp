import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Every HTTP handler in every domain controller must declare either
 * @RequirePermission(...) or @Public() (src/common/decorators.ts promises this
 * check). Source-level scan: for each @Get/@Post/@Patch/@Put/@Delete, one of
 * the two decorators must appear in the decorator block directly above/below
 * it (same decorator stack), or on the controller class.
 */
const MODULES_DIR = path.join(__dirname, '..', 'src', 'modules');
const HTTP_DECORATOR = /@(Get|Post|Patch|Put|Delete)\s*\(/;

function controllerFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...controllerFiles(full));
    else if (entry.endsWith('.controller.ts')) out.push(full);
  }
  return out;
}

describe('every domain route declares RequirePermission or Public', () => {
  const files = controllerFiles(MODULES_DIR);

  it('found controller files', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  for (const file of files) {
    it(path.relative(MODULES_DIR, file), () => {
      const source = readFileSync(file, 'utf8');
      const lines = source.split('\n');
      const classLevelGuard =
        /@RequirePermission\([^)]*\)\s*(\r?\n\s*@\w+.*)*\r?\n\s*export class/.test(source) ||
        /@Public\(\)\s*(\r?\n\s*@\w+.*)*\r?\n\s*(@Controller|export class)/.test(source);

      const unprotected: string[] = [];
      lines.forEach((line, i) => {
        if (!HTTP_DECORATOR.test(line)) return;
        // Walk the contiguous decorator stack around this line (decorators sit
        // on consecutive lines between the previous member and the method).
        let start = i;
        while (start > 0 && /^\s*@\w+/.test(lines[start - 1] ?? '')) start--;
        let end = i;
        while (end < lines.length - 1 && /^\s*@\w+|^\s*[)\],{}]|^\s*$/.test(lines[end + 1] ?? '')) {
          end++;
          if (/\w+\s*\(.*\)\s*{|\basync\b/.test(lines[end] ?? '')) break;
        }
        const stack = lines.slice(start, Math.min(end + 3, lines.length)).join('\n');
        const protectedRoute =
          stack.includes('@RequirePermission(') || stack.includes('@Public()');
        if (!protectedRoute && !classLevelGuard) {
          unprotected.push(`line ${i + 1}: ${line.trim()}`);
        }
      });

      expect(unprotected, `Unprotected handlers:\n${unprotected.join('\n')}`).toEqual([]);
    });
  }
});
