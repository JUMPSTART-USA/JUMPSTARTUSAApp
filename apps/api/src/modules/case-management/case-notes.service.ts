import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@jumpstart/database';
import type { CaseNoteInput, ListQuery, NoteCategory } from '@jumpstart/shared';
import { AuditService } from '../../audit/audit.service';
import { assertChapterAccess } from '../../common/chapter.util';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedUser } from '../../common/types';
import { assertParticipant, personName } from './participant.util';

export interface CaseNoteListFilters {
  participantProfileId?: string;
  category?: NoteCategory;
  from?: Date;
  to?: Date;
  /** Chapter filter (§7.2) — callers (incl. reports exports) pass the forced viewer chapter. */
  state?: string;
}

const SORTABLE = new Set(['noteDate', 'category', 'contactType', 'createdAt']);

const NOTE_INCLUDE = {
  caseManager: { select: { firstName: true, lastName: true } },
  participantProfile: {
    select: {
      assignedCaseManagerId: true,
      chapterState: true,
      person: { select: { firstName: true, lastName: true } },
    },
  },
} satisfies Prisma.CaseNoteInclude;

type NoteWithRelations = Prisma.CaseNoteGetPayload<{ include: typeof NOTE_INCLUDE }>;

/**
 * §7.3 — confidential note content is readable ONLY by the author, the
 * participant's CURRENT assigned case manager, and holders of
 * case_notes.confidential.read.
 */
function canReadConfidential(note: NoteWithRelations, viewer: AuthenticatedUser): boolean {
  return (
    note.caseManagerId === viewer.id ||
    note.participantProfile.assignedCaseManagerId === viewer.id ||
    viewer.permissions.has('case_notes.confidential.read')
  );
}

/**
 * Unauthorized viewers get a dated stub, so the record's completeness stays
 * visible without the content (§7.3). viewer = null means "no one" (exports).
 */
function present(note: NoteWithRelations, viewer: AuthenticatedUser | null) {
  const caseManagerName = `${note.caseManager.firstName} ${note.caseManager.lastName}`;
  if (note.confidential && (!viewer || !canReadConfidential(note, viewer))) {
    return {
      id: note.id,
      noteDate: note.noteDate,
      confidential: true as const,
      content: '[Confidential note]',
      category: note.category,
      caseManagerName,
    };
  }
  const { caseManager: _cm, participantProfile, ...rest } = note;
  return {
    ...rest,
    caseManagerName,
    participantName: personName(participantProfile.person),
  };
}

@Injectable()
export class CaseNotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private buildWhere(filters: CaseNoteListFilters): Prisma.CaseNoteWhereInput {
    return {
      deletedAt: null,
      ...(filters.participantProfileId
        ? { participantProfileId: filters.participantProfileId }
        : {}),
      // Chapter scoping (§7.2): derived through the participant profile.
      ...(filters.state ? { participantProfile: { chapterState: filters.state } } : {}),
      ...(filters.category ? { category: filters.category } : {}),
      ...(filters.from || filters.to
        ? {
            noteDate: {
              ...(filters.from ? { gte: filters.from } : {}),
              ...(filters.to ? { lte: filters.to } : {}),
            },
          }
        : {}),
    };
  }

  // Note: no free-text search on notes — matching against confidential content
  // would let an unauthorized viewer probe it via the stub list (§7.3).
  async list(query: ListQuery, filters: CaseNoteListFilters, viewer: AuthenticatedUser) {
    const where = this.buildWhere(filters);

    const orderBy: Prisma.CaseNoteOrderByWithRelationInput =
      query.sortBy && SORTABLE.has(query.sortBy)
        ? { [query.sortBy]: query.sortDir }
        : { noteDate: 'desc' };

    const [notes, total] = await this.prisma.$transaction([
      this.prisma.caseNote.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: NOTE_INCLUDE,
      }),
      this.prisma.caseNote.count({ where }),
    ]);

    return {
      items: notes.map((n) => present(n, viewer)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  /**
   * Export path for the reports module — the reports module MUST use this
   * method: it stubs confidential notes for EVERY caller, so confidential
   * content can never leave through an export (§7.3).
   */
  async listForExport(filters: CaseNoteListFilters) {
    const notes = await this.prisma.caseNote.findMany({
      where: this.buildWhere(filters),
      orderBy: { noteDate: 'desc' },
      include: NOTE_INCLUDE,
    });
    return notes.map((n) => present(n, null));
  }

  async get(id: string, viewer: AuthenticatedUser) {
    const note = await this.prisma.caseNote.findFirst({
      where: { id, deletedAt: null },
      include: NOTE_INCLUDE,
    });
    if (!note) throw new NotFoundException('Case note not found');
    // Chapter scoping (§7.2): same derivation as the list filter (participant).
    assertChapterAccess(viewer.chapter, note.participantProfile.chapterState);

    // §7.3 — reads of confidential content are themselves audit-logged.
    if (note.confidential && canReadConfidential(note, viewer)) {
      await this.audit.logConfidentialRead(viewer.id, 'case_note', id);
    }
    return present(note, viewer);
  }

  async create(input: CaseNoteInput, user: AuthenticatedUser) {
    const userId = user.id;
    await assertParticipant(this.prisma, input.participantProfileId, user.chapter);
    // The author is always the current user — a note cannot be written "as"
    // someone else.
    const note = await this.prisma.caseNote.create({
      data: { ...input, caseManagerId: userId, createdById: userId, updatedById: userId },
    });
    await this.audit.logCreate(userId, 'case_note', note.id, note);
    return note;
  }

  /** PATCH/DELETE are restricted to the author or a confidential.read holder. */
  private async getForModify(id: string, user: AuthenticatedUser) {
    const note = await this.prisma.caseNote.findFirst({
      where: { id, deletedAt: null },
      include: { participantProfile: { select: { chapterState: true } } },
    });
    if (!note) throw new NotFoundException('Case note not found');
    // Chapter scoping (§7.2): same derivation as the list filter (participant).
    assertChapterAccess(user.chapter, note.participantProfile.chapterState);
    if (note.caseManagerId !== user.id && !user.permissions.has('case_notes.confidential.read')) {
      throw new ForbiddenException(
        'Only the note author or a case-management supervisor may modify this note',
      );
    }
    const { participantProfile: _participantProfile, ...noteOnly } = note;
    return noteOnly;
  }

  async update(id: string, input: Partial<CaseNoteInput>, user: AuthenticatedUser) {
    const existing = await this.getForModify(id, user);
    if (input.participantProfileId) {
      await assertParticipant(this.prisma, input.participantProfileId, user.chapter);
    }

    // Cross-field rule from caseNoteSchema, re-checked against the merged
    // record because .partial() drops the superRefine.
    const followUpRequired = input.followUpRequired ?? existing.followUpRequired;
    const followUpDate =
      input.followUpDate !== undefined ? input.followUpDate : existing.followUpDate;
    if (followUpRequired && !followUpDate) {
      throw new BadRequestException('A follow-up date is required when follow-up is marked required');
    }

    const updated = await this.prisma.caseNote.update({
      where: { id },
      data: { ...input, updatedById: user.id },
    });
    await this.audit.logUpdate(user.id, 'case_note', id, existing, updated);
    return updated;
  }

  async softDelete(id: string, user: AuthenticatedUser) {
    const existing = await this.getForModify(id, user);
    await this.prisma.caseNote.update({
      where: { id },
      data: { deletedAt: new Date(), updatedById: user.id },
    });
    await this.audit.logDelete(user.id, 'case_note', id, existing);
    return { ok: true };
  }

  async completeFollowUp(id: string, user: AuthenticatedUser) {
    const userId = user.id;
    const existing = await this.prisma.caseNote.findFirst({
      where: { id, deletedAt: null },
      include: { participantProfile: { select: { chapterState: true } } },
    });
    if (!existing) throw new NotFoundException('Case note not found');
    // Chapter scoping (§7.2): same derivation as the list filter (participant).
    assertChapterAccess(user.chapter, existing.participantProfile.chapterState);
    if (!existing.followUpRequired) {
      throw new BadRequestException('This note has no follow-up scheduled');
    }
    if (existing.followUpDoneAt) {
      throw new ConflictException('Follow-up is already completed');
    }
    const { participantProfile: _participantProfile, ...noteOnly } = existing;
    const updated = await this.prisma.caseNote.update({
      where: { id },
      data: { followUpDoneAt: new Date(), updatedById: userId },
    });
    await this.audit.logUpdate(userId, 'case_note', id, noteOnly, updated);
    return updated;
  }
}
