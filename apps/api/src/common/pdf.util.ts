/**
 * Shared PDF rendering (pdfkit): report tables and letter batches both use
 * this so every PDF the platform emits carries the same header/footer chrome
 * (org name, generated-at timestamp, filter echo) per plan §9.1.
 */
import PDFDocument from 'pdfkit';

export const PDF_MARGIN = 54; // 0.75in

export function createPdf(opts?: PDFKit.PDFDocumentOptions): PDFKit.PDFDocument {
  return new PDFDocument({ size: 'LETTER', margin: PDF_MARGIN, bufferPages: true, ...opts });
}

export function pdfToBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}

/** Title block: document name + generated-at + optional context line. */
export function pdfHeader(doc: PDFKit.PDFDocument, title: string, contextLine?: string): void {
  doc.font('Helvetica-Bold').fontSize(16).text('JUMPSTART USA', { continued: false });
  doc.moveDown(0.2);
  doc.font('Helvetica-Bold').fontSize(13).text(title);
  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor('#555555')
    .text(`Generated ${new Date().toLocaleString('en-US')}${contextLine ? ` · ${contextLine}` : ''}`);
  doc.fillColor('#000000').moveDown(1);
}

/** Page-number footers across all buffered pages — call last, before end. */
export function pdfFooters(doc: PDFKit.PDFDocument): void {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor('#777777')
      .text(`Page ${i + 1} of ${range.count}`, PDF_MARGIN, doc.page.height - 40, {
        width: doc.page.width - PDF_MARGIN * 2,
        align: 'center',
      });
  }
  doc.fillColor('#000000');
}

/**
 * Simple repeating-header table. Column widths proportional to header length
 * unless `widths` given (fractions summing to 1). Long cells wrap.
 */
export function pdfTable(
  doc: PDFKit.PDFDocument,
  headers: string[],
  rows: string[][],
  widths?: number[],
): void {
  const usable = doc.page.width - PDF_MARGIN * 2;
  const fractions =
    widths ??
    (() => {
      const total = headers.reduce((s, h) => s + Math.max(h.length, 6), 0);
      return headers.map((h) => Math.max(h.length, 6) / total);
    })();
  const colWidths = fractions.map((f) => f * usable);

  const drawHeader = () => {
    let x = PDF_MARGIN;
    const y = doc.y;
    doc.font('Helvetica-Bold').fontSize(8);
    headers.forEach((h, c) => {
      doc.text(h.toUpperCase(), x, y, { width: colWidths[c]! - 6 });
      x += colWidths[c]!;
    });
    doc
      .moveTo(PDF_MARGIN, doc.y + 2)
      .lineTo(PDF_MARGIN + usable, doc.y + 2)
      .strokeColor('#999999')
      .stroke();
    doc.moveDown(0.4);
  };

  drawHeader();
  doc.font('Helvetica').fontSize(8);
  for (const row of rows) {
    const heights = row.map((cell, c) =>
      doc.heightOfString(cell ?? '', { width: colWidths[c]! - 6 }),
    );
    const rowHeight = Math.max(...heights, 10) + 4;
    if (doc.y + rowHeight > doc.page.height - 60) {
      doc.addPage();
      drawHeader();
      doc.font('Helvetica').fontSize(8);
    }
    const y = doc.y;
    let x = PDF_MARGIN;
    row.forEach((cell, c) => {
      doc.text(cell ?? '', x, y, { width: colWidths[c]! - 6 });
      x += colWidths[c]!;
    });
    doc.y = y + rowHeight;
  }
}
