import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@jumpstart/database';
import type { DrugTestInput, DrugTestResult, ListQuery } from '@jumpstart/shared';
import { AuditService } from '../../audit/audit.service';
import { assertChapterAccess } from '../../common/chapter.util';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedUser } from '../../common/types';
import { assertParticipant } from './participant.util';

/**
 * Shape of an in-memory multer upload. Declared locally because @types/multer
 * is not installed in this workspace (Express.Multer.File is unavailable) —
 * these four fields are the only ones we touch.
 */
export interface UploadedPhotoFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export type DrugTestCreateInput = DrugTestInput & { participantProfileId: string };
export type DrugTestUpdateInput = Partial<DrugTestCreateInput>;

export interface DrugTestListFilters {
  participantProfileId?: string;
  result?: DrugTestResult;
  from?: Date;
  to?: Date;
  state?: string;
}

const SORTABLE = new Set(['testDate', 'testType', 'result', 'createdAt']);

/**
 * Contract: photoData NEVER appears in list/detail responses — the photo
 * endpoint is the only reader of the bytes column. Every other query selects
 * exactly these fields; hasPhoto is derived from photoMimeType.
 */
const VIEW_SELECT = {
  id: true,
  participantProfileId: true,
  testDate: true,
  testType: true,
  result: true,
  notes: true,
  photoMimeType: true,
  photoFileName: true,
  createdAt: true,
} as const;

/** List rows add the same participant summary case-services rows carry. */
const LIST_SELECT = {
  ...VIEW_SELECT,
  participantProfile: {
    select: { person: { select: { firstName: true, lastName: true } } },
  },
} as const;

type DrugTestViewRow = Prisma.DrugTestGetPayload<{ select: typeof VIEW_SELECT }>;
type DrugTestListRow = Prisma.DrugTestGetPayload<{ select: typeof LIST_SELECT }>;

function toView(row: DrugTestViewRow) {
  const { photoMimeType, ...rest } = row;
  return { ...rest, hasPhoto: photoMimeType != null };
}

function toListItem(row: DrugTestListRow) {
  const { photoMimeType, participantProfile, ...rest } = row;
  return { ...rest, hasPhoto: photoMimeType != null, participant: participantProfile };
}

export type DrugTestView = ReturnType<typeof toView>;
export type DrugTestListItem = ReturnType<typeof toListItem>;

@Injectable()
export class DrugTestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListQuery, filters: DrugTestListFilters) {
    const where: Prisma.DrugTestWhereInput = {
      deletedAt: null,
      ...(filters.participantProfileId
        ? { participantProfileId: filters.participantProfileId }
        : {}),
      // Chapter scoping (§7.2): derived through the participant profile. Wrapped
      // in AND so the search's own participantProfile clause cannot replace it.
      ...(filters.state
        ? { AND: [{ participantProfile: { chapterState: filters.state } }] }
        : {}),
      ...(filters.result ? { result: filters.result } : {}),
      ...(filters.from || filters.to
        ? {
            testDate: {
              ...(filters.from ? { gte: filters.from } : {}),
              ...(filters.to ? { lte: filters.to } : {}),
            },
          }
        : {}),
      ...(query.search
        ? {
            participantProfile: {
              OR: [
                { participantNumber: { contains: query.search, mode: 'insensitive' } },
                { person: { firstName: { contains: query.search, mode: 'insensitive' } } },
                { person: { lastName: { contains: query.search, mode: 'insensitive' } } },
              ],
            },
          }
        : {}),
    };

    const orderBy: Prisma.DrugTestOrderByWithRelationInput =
      query.sortBy && SORTABLE.has(query.sortBy)
        ? { [query.sortBy]: query.sortDir }
        : { testDate: 'desc' };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.drugTest.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: LIST_SELECT,
      }),
      this.prisma.drugTest.count({ where }),
    ]);

    return { items: rows.map(toListItem), total, page: query.page, pageSize: query.pageSize };
  }

  async create(
    input: DrugTestCreateInput,
    photo: UploadedPhotoFile | undefined,
    user: AuthenticatedUser,
  ) {
    const userId = user.id;
    await assertParticipant(this.prisma, input.participantProfileId, user.chapter);
    const created = await this.prisma.drugTest.create({
      data: {
        ...input,
        createdById: userId,
        ...(photo ? this.photoColumns(photo) : {}),
      },
      select: VIEW_SELECT,
    });
    const view = toView(created);
    // Audit the VIEW, not the record — photo bytes must not land in audit rows.
    await this.audit.logCreate(userId, 'drug_test', created.id, view);
    return view;
  }

  async update(
    id: string,
    input: DrugTestUpdateInput,
    photo: UploadedPhotoFile | undefined,
    user: AuthenticatedUser,
  ) {
    const userId = user.id;
    const existing = await this.findTest(id, user.chapter);
    if (input.participantProfileId) {
      await assertParticipant(this.prisma, input.participantProfileId, user.chapter);
    }

    const updated = await this.prisma.drugTest.update({
      where: { id },
      // A new photo REPLACES the stored one (contract); omitting the file
      // leaves the existing photo untouched.
      data: { ...input, ...(photo ? this.photoColumns(photo) : {}) },
      select: VIEW_SELECT,
    });
    const view = toView(updated);
    await this.audit.logUpdate(userId, 'drug_test', id, toView(existing), view);
    return view;
  }

  async softDelete(id: string, user: AuthenticatedUser) {
    const existing = await this.findTest(id, user.chapter);
    await this.prisma.drugTest.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.audit.logDelete(user.id, 'drug_test', id, toView(existing));
    return { ok: true };
  }

  /** The one query allowed to read photoData — streams bytes to the caller. */
  async getPhoto(
    id: string,
    userChapter: string | null,
  ): Promise<{ data: Buffer; mimeType: string; fileName: string }> {
    const row = await this.prisma.drugTest.findFirst({
      where: { id, deletedAt: null },
      select: {
        photoData: true,
        photoMimeType: true,
        photoFileName: true,
        participantProfile: { select: { chapterState: true } },
      },
    });
    if (!row) throw new NotFoundException('Drug test not found');
    // Chapter scoping (§7.2): the photo is the most sensitive read here —
    // guard it exactly like the record itself (participant chapter).
    assertChapterAccess(userChapter, row.participantProfile.chapterState);
    if (!row.photoData || !row.photoMimeType) {
      throw new NotFoundException('This drug test has no photo');
    }
    return {
      data: Buffer.from(row.photoData),
      mimeType: row.photoMimeType,
      fileName: row.photoFileName ?? 'photo',
    };
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  private photoColumns(photo: UploadedPhotoFile) {
    return {
      // Copy into a fresh Uint8Array: Prisma's Bytes input is typed
      // Uint8Array<ArrayBuffer>, while Buffer is Uint8Array<ArrayBufferLike>.
      photoData: new Uint8Array(photo.buffer),
      photoMimeType: photo.mimetype,
      photoFileName: photo.originalname,
    };
  }

  /** Fetch-for-mutation with the chapter guard (§7.2) applied once. */
  private async findTest(id: string, userChapter: string | null): Promise<DrugTestViewRow> {
    const test = await this.prisma.drugTest.findFirst({
      where: { id, deletedAt: null },
      select: { ...VIEW_SELECT, participantProfile: { select: { chapterState: true } } },
    });
    if (!test) throw new NotFoundException('Drug test not found');
    assertChapterAccess(userChapter, test.participantProfile.chapterState);
    const { participantProfile: _participantProfile, ...testOnly } = test;
    return testOnly;
  }
}
