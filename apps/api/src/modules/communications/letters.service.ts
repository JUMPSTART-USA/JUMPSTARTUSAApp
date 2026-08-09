import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../audit/audit.service';
import { assertChapterAccess } from '../../common/chapter.util';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedUser } from '../../common/types';
import { createPdf, pdfFooters, pdfHeader, pdfTable, pdfToBuffer, PDF_MARGIN } from '../../common/pdf.util';

/** The Person fields a mailed letter needs. */
const LETTER_PERSON_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  suffix: true,
  addressLine1: true,
  addressLine2: true,
  city: true,
  state: true,
  zip: true,
} as const;

interface LetterPerson {
  firstName: string;
  lastName: string;
  suffix: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
}

interface LetterRow {
  id: string;
  body: string;
  status: string;
  person: LetterPerson;
}

/**
 * Letter generation + returned-mail logging (§6.12). Letters are never
 * auto-dispatched: staff download a merged PDF (one page per letter, org
 * letterhead, recipient address block) plus an address-label summary page,
 * print, stuff, and mail. Generation marks the queued letters sent — the PDF
 * leaving the server IS the send event — with an audit row recording both the
 * export and the status flip.
 */
@Injectable()
export class LettersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Every letter in a batch, one page each, plus an address-label summary page. */
  async batchLettersPdf(batchId: string, user: AuthenticatedUser) {
    const batch = await this.prisma.communicationBatch.findUnique({ where: { id: batchId } });
    if (!batch) throw new NotFoundException('Batch not found');
    // Chapter scoping (§7.2): the PDF marks letters sent — chapter-guarded.
    assertChapterAccess(user.chapter, batch.chapterState);
    if (batch.channel !== 'letter') {
      throw new BadRequestException('Not a letter batch — letters.pdf applies to letter batches only');
    }

    const letters: LetterRow[] = await this.prisma.communication.findMany({
      where: { batchId, channel: 'letter' },
      select: { id: true, body: true, status: true, person: { select: LETTER_PERSON_SELECT } },
      orderBy: [{ person: { lastName: 'asc' } }, { person: { firstName: 'asc' } }],
    });
    if (letters.length === 0) throw new BadRequestException('Batch has no letters to render');

    const buffer = await this.renderPdf(letters, `Address labels — ${batch.name}`);

    // The PDF leaving the server is the send event for queued rows. Re-downloads
    // (reprints) leave sent/returned rows untouched.
    const now = new Date();
    const { count: markedSent } = await this.prisma.communication.updateMany({
      where: { batchId, channel: 'letter', status: 'queued' },
      data: { status: 'sent', sentAt: now },
    });
    if (batch.status !== 'sent') {
      await this.prisma.communicationBatch.update({
        where: { id: batchId },
        data: { status: 'sent', sentAt: batch.sentAt ?? now, updatedById: user.id },
      });
    }
    await this.audit.log({
      userId: user.id,
      action: 'export',
      entityType: 'communication_batch',
      entityId: batchId,
      metadata: { via: 'letters.pdf', letters: letters.length, markedSent },
    });

    return { buffer, filename: `letters-${slug(batch.name)}-${isoDate()}.pdf` };
  }

  /** One-off letter render — same page chrome, no summary page. */
  async singleLetterPdf(communicationId: string, user: AuthenticatedUser) {
    const letter = await this.prisma.communication.findUnique({
      where: { id: communicationId },
      select: {
        id: true,
        body: true,
        status: true,
        channel: true,
        chapterState: true,
        sentAt: true,
        person: { select: LETTER_PERSON_SELECT },
      },
    });
    if (!letter) throw new NotFoundException('Communication not found');
    // Chapter scoping (§7.2)
    assertChapterAccess(user.chapter, letter.chapterState);
    if (letter.channel !== 'letter') {
      throw new BadRequestException('Only letter communications render as letter.pdf');
    }

    const buffer = await this.renderPdf([letter], null);

    if (letter.status === 'queued') {
      const updated = await this.prisma.communication.update({
        where: { id: letter.id },
        data: { status: 'sent', sentAt: new Date() },
      });
      await this.audit.logUpdate(
        user.id,
        'communication',
        letter.id,
        { status: letter.status, sentAt: letter.sentAt },
        { status: updated.status, sentAt: updated.sentAt },
      );
    }
    await this.audit.log({
      userId: user.id,
      action: 'export',
      entityType: 'communication',
      entityId: letter.id,
      metadata: { via: 'letter.pdf' },
    });

    const name = `${letter.person.lastName}-${letter.person.firstName}`;
    return { buffer, filename: `letter-${slug(name)}-${isoDate()}.pdf` };
  }

  /** Returned-mail logging: a sent letter came back → status 'returned'. */
  async markReturned(communicationId: string, note: string | undefined, user: AuthenticatedUser) {
    const comm = await this.prisma.communication.findUnique({ where: { id: communicationId } });
    if (!comm) throw new NotFoundException('Communication not found');
    // Chapter scoping (§7.2)
    assertChapterAccess(user.chapter, comm.chapterState);
    if (comm.channel !== 'letter') {
      throw new BadRequestException('Only letters can be marked returned');
    }
    if (comm.status === 'returned') return comm; // idempotent
    if (comm.status !== 'sent') {
      throw new BadRequestException('Only sent letters can be marked returned');
    }
    const updated = await this.prisma.communication.update({
      where: { id: communicationId },
      data: {
        status: 'returned',
        statusDetail: note ? `Returned mail: ${note}` : 'Returned mail',
      },
    });
    await this.audit.logUpdate(user.id, 'communication', communicationId, comm, updated);
    return updated;
  }

  // ── Rendering ──────────────────────────────────────────────────────────────

  /**
   * One US-Letter page per letter: org letterhead, date, recipient address
   * block, body. When `summaryTitle` is given, a final address-label summary
   * page (shared pdfHeader + pdfTable chrome) is appended for the print run.
   * Page-number footers across the whole document aid collation.
   */
  private async renderPdf(letters: LetterRow[], summaryTitle: string | null): Promise<Buffer> {
    const doc = createPdf();
    const dateLine = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    letters.forEach((letter, i) => {
      if (i > 0) doc.addPage();
      doc.font('Helvetica-Bold').fontSize(16).text('JUMPSTART USA', PDF_MARGIN, PDF_MARGIN);
      doc.moveDown(1.5);
      doc.font('Helvetica').fontSize(10).text(dateLine);
      doc.moveDown(1.5);
      for (const line of addressBlock(letter.person)) doc.text(line);
      doc.moveDown(2);
      doc.fontSize(11).text(letter.body, { lineGap: 3 });
    });

    if (summaryTitle) {
      doc.addPage();
      pdfHeader(doc, summaryTitle, `${letters.length} letters`);
      pdfTable(
        doc,
        ['Name', 'Address', 'City', 'State', 'ZIP'],
        letters.map((l) => [
          recipientName(l.person),
          [l.person.addressLine1, l.person.addressLine2].filter(Boolean).join(', '),
          l.person.city ?? '',
          l.person.state ?? '',
          l.person.zip ?? '',
        ]),
        [0.28, 0.32, 0.2, 0.08, 0.12],
      );
    }

    pdfFooters(doc);
    return pdfToBuffer(doc);
  }
}

function recipientName(p: LetterPerson): string {
  return [p.firstName, p.lastName, p.suffix].filter(Boolean).join(' ');
}

/** Mailing address block: name, street line(s), "City, ST ZIP". */
function addressBlock(p: LetterPerson): string[] {
  const cityLine = [p.city, [p.state, p.zip].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(', ');
  return [recipientName(p), p.addressLine1, p.addressLine2, cityLine].filter(
    (line): line is string => Boolean(line),
  );
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function isoDate(): string {
  return new Date().toISOString().slice(0, 10);
}
