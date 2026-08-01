import { stringify } from 'csv-stringify/sync';
import * as ExcelJS from 'exceljs';
import {
  createPdf,
  pdfFooters,
  pdfHeader,
  pdfTable,
  pdfToBuffer,
} from '../../common/pdf.util';
import type { ReportCell, ReportResult } from './reports.service';

/** Rows are already flat primitives — rendering is a straight projection. */
export function reportToCsv(result: ReportResult): string {
  return stringify(
    result.rows.map((row) => result.columns.map((c) => row[c.key] ?? '')),
    { header: true, columns: result.columns.map((c) => c.label) },
  );
}

export function reportToWorkbook(result: ReportResult, sheetName: string): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  // Excel caps sheet names at 31 characters.
  const sheet = workbook.addWorksheet(sheetName.slice(0, 31));
  sheet.columns = result.columns.map((c) => ({
    header: c.label,
    key: c.key,
    width: Math.min(40, Math.max(12, c.label.length + 4)),
  }));
  for (const row of result.rows) sheet.addRow(row);
  sheet.getRow(1).font = { bold: true };
  return workbook;
}

/**
 * Money/percent column keys — mirrors the web renderer's MONEY_KEYS /
 * PERCENT_KEYS in apps/web/src/pages/reports/ReportRunnerPage.tsx so a PDF
 * reads the same as the on-screen table. CSV/XLSX stay raw on purpose
 * (spreadsheets want numbers, not strings).
 */
const PDF_MONEY_KEYS = new Set([
  'amount',
  'cost',
  'revenue',
  'expenses',
  'net',
  'goalAmount',
  'raisedToDate',
  'linkedDonations',
  'payRate',
]);
const PDF_PERCENT_KEYS = new Set(['occupancyPct', 'pctOfGoal']);

function pdfCell(colKey: string, value: ReportCell | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') {
    if (PDF_MONEY_KEYS.has(colKey)) {
      return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
    }
    if (PDF_PERCENT_KEYS.has(colKey)) return `${value}%`;
    return value.toLocaleString('en-US');
  }
  // Strings pass through — ISO dates stay ISO, matching the CSV projection.
  return value;
}

/**
 * Report → PDF using the shared pdfkit chrome (§9.1): org header with the
 * report name + filter echo, repeating-header table, page-number footers.
 * Landscape when the report is wide (>6 columns).
 */
export async function reportToPdf(
  result: ReportResult,
  title: string,
  filterEcho: Record<string, unknown>,
): Promise<Buffer> {
  const doc = createPdf(result.columns.length > 6 ? { layout: 'landscape' } : undefined);
  const filterLine = Object.entries(filterEcho)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(' · ');
  pdfHeader(doc, title, filterLine || undefined);
  pdfTable(
    doc,
    result.columns.map((c) => c.label),
    result.rows.map((row) => result.columns.map((c) => pdfCell(c.key, row[c.key]))),
  );
  pdfFooters(doc);
  return pdfToBuffer(doc);
}

/** Filter echo for the audit row (§9.1): drop unset params, flatten dates. */
export function exportFilterEcho(params: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    out[key] = value instanceof Date ? value.toISOString().slice(0, 10) : value;
  }
  return out;
}
