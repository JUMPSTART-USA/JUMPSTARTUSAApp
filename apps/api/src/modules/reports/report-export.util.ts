import { stringify } from 'csv-stringify/sync';
import * as ExcelJS from 'exceljs';
import type { ReportResult } from './reports.service';

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

/** Filter echo for the audit row (§9.1): drop unset params, flatten dates. */
export function exportFilterEcho(params: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    out[key] = value instanceof Date ? value.toISOString().slice(0, 10) : value;
  }
  return out;
}
