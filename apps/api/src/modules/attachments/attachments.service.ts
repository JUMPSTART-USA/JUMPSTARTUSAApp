import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@jumpstart/database';
import {
  isAllowedAttachmentType,
  normalizeContentType,
  type AttachmentEntityType,
  type AttachmentListQuery,
  type AttachmentUploadInput,
  type PermissionKey,
} from '@jumpstart/shared';
import { attachmentContentType } from '../../common/file-signature.util';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { assertChapterAccess } from '../../common/chapter.util';
import type { AuthenticatedUser } from '../../common/types';

/**
 * Shape of an in-memory multer upload (drug-tests precedent — @types/multer
 * is not installed in this workspace; these are the only fields we touch).
 */
export interface UploadedAttachmentFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/**
 * Contract: `data` NEVER appears in list responses — the download path is the
 * only reader of the bytes column.
 */
const VIEW_SELECT = {
  id: true,
  entityType: true,
  entityId: true,
  filename: true,
  contentType: true,
  sizeBytes: true,
  sensitivity: true,
  uploadedById: true,
  createdAt: true,
} as const;

export type AttachmentView = Prisma.AttachmentGetPayload<{ select: typeof VIEW_SELECT }>;

interface EntityRule {
  /** Gates list + download. */
  read: PermissionKey;
  /** Gates upload + delete. */
  write: PermissionKey;
  /**
   * Locate the parent (respecting its soft delete where it has one) and derive
   * its chapter (§7.2) so attachment access is chapter-scoped like the parent.
   * Returns null when the parent does not exist; chapterState is the parent's
   * chapter or null for chapter-neutral parents.
   */
  locate: (
    prisma: PrismaService,
    id: string,
  ) => Promise<{ id: string; chapterState: string | null } | null>;
}

/**
 * THE authorization table (one place): entityType → permission pair + parent
 * lookup. Attachment access always derives from the entity the file hangs on,
 * including its chapter (§7.2) — a scoped user reaches only their chapter's
 * files. VolunteerTraining / VolunteerClearance have no deletedAt column, so
 * their checks are plain existence.
 */
const ENTITY_RULES: Record<AttachmentEntityType, EntityRule> = {
  participant_profile: {
    read: 'participants.read',
    write: 'participants.update',
    locate: async (prisma, id) =>
      prisma.participantProfile.findFirst({
        where: { id, deletedAt: null },
        select: { id: true, chapterState: true },
      }),
  },
  case_note: {
    read: 'case_management.read',
    write: 'case_management.update',
    locate: async (prisma, id) => {
      const row = await prisma.caseNote.findFirst({
        where: { id, deletedAt: null },
        select: { id: true, participantProfile: { select: { chapterState: true } } },
      });
      return row ? { id: row.id, chapterState: row.participantProfile.chapterState } : null;
    },
  },
  vehicle_maintenance_record: {
    read: 'vehicles.read',
    write: 'vehicles.update',
    locate: async (prisma, id) => {
      const row = await prisma.vehicleMaintenanceRecord.findFirst({
        where: { id, deletedAt: null },
        select: { id: true, vehicle: { select: { chapterState: true } } },
      });
      return row ? { id: row.id, chapterState: row.vehicle.chapterState } : null;
    },
  },
  volunteer_training: {
    read: 'volunteers.read',
    write: 'volunteers.update',
    locate: async (prisma, id) => {
      const row = await prisma.volunteerTraining.findFirst({
        where: { id },
        select: { id: true, volunteerProfile: { select: { chapterState: true } } },
      });
      return row ? { id: row.id, chapterState: row.volunteerProfile.chapterState } : null;
    },
  },
  volunteer_clearance: {
    read: 'volunteers.read',
    write: 'volunteers.update',
    locate: async (prisma, id) => {
      const row = await prisma.volunteerClearance.findFirst({
        where: { id },
        select: { id: true, volunteerProfile: { select: { chapterState: true } } },
      });
      return row ? { id: row.id, chapterState: row.volunteerProfile.chapterState } : null;
    },
  },
};

/** §7.3 special permission that unlocks confidential attachments. */
const CONFIDENTIAL_READ: PermissionKey = 'case_notes.confidential.read';

@Injectable()
export class AttachmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** List an entity's attachments — confidential rows are HIDDEN (not 403d)
   *  from viewers without case_notes.confidential.read. Never returns bytes. */
  async list(query: AttachmentListQuery, viewer: AuthenticatedUser): Promise<AttachmentView[]> {
    const rules = this.rulesFor(query.entityType);
    this.requirePermission(viewer, rules.read);

    // Chapter scoping (§7.2): resolve the parent and reject if it is another
    // chapter's — a scoped user cannot list a foreign entity's attachments.
    const parent = await rules.locate(this.prisma, query.entityId);
    if (!parent) throw new NotFoundException(`${query.entityType} not found`);
    assertChapterAccess(viewer.chapter, parent.chapterState);

    return this.prisma.attachment.findMany({
      where: {
        entityType: query.entityType,
        entityId: query.entityId,
        deletedAt: null,
        ...(viewer.permissions.has(CONFIDENTIAL_READ)
          ? {}
          : { sensitivity: { not: 'confidential' } }),
      },
      orderBy: { createdAt: 'desc' },
      select: VIEW_SELECT,
    });
  }

  async upload(
    input: AttachmentUploadInput,
    file: UploadedAttachmentFile,
    user: AuthenticatedUser,
  ): Promise<AttachmentView> {
    const rules = this.rulesFor(input.entityType);
    this.requirePermission(user, rules.write);

    const entity = await rules.locate(this.prisma, input.entityId);
    if (!entity) throw new NotFoundException(`${input.entityType} not found`);
    // Chapter scoping (§7.2): no uploading into another chapter's entity.
    assertChapterAccess(user.chapter, entity.chapterState);

    /**
     * The declared type got the file past multer's filter; the BYTES decide
     * what gets stored, and therefore what the download later serves. Until
     * this check existed the uploader chose the Content-Type a browser would
     * apply to a file other staff opened.
     */
    const contentType = attachmentContentType(normalizeContentType(file.mimetype), file.buffer);
    if (!contentType) {
      throw new BadRequestException(
        'That file’s contents do not match its file type — re-save it and try again',
      );
    }
    if (!isAllowedAttachmentType(contentType)) {
      // The bytes resolved to something off the allowlist — an SVG or an HTML
      // document relabelled as a PNG on the way in.
      throw new BadRequestException(
        'File type not allowed — images, PDF, Office documents, text and CSV only',
      );
    }

    const created = await this.prisma.attachment.create({
      data: {
        entityType: input.entityType,
        entityId: input.entityId,
        // Copy into a fresh Uint8Array: Prisma's Bytes input is typed
        // Uint8Array<ArrayBuffer>, while Buffer is Uint8Array<ArrayBufferLike>.
        data: new Uint8Array(file.buffer),
        filename: input.filename ?? file.originalname,
        contentType,
        sizeBytes: file.size,
        sensitivity: input.sensitivity,
        uploadedById: user.id,
      },
      select: VIEW_SELECT,
    });

    // Audit the VIEW — file bytes must never land in audit rows.
    await this.audit.logCreate(user.id, 'attachment', created.id, created);
    return created;
  }

  /** The one reader of the bytes column — streams to the download endpoint. */
  async download(
    id: string,
    viewer: AuthenticatedUser,
  ): Promise<{ data: Buffer; filename: string; contentType: string }> {
    const row = await this.prisma.attachment.findFirst({
      where: { id, deletedAt: null },
      select: { ...VIEW_SELECT, data: true },
    });
    if (!row) throw new NotFoundException('Attachment not found');

    const rules = this.rulesFor(row.entityType);
    this.requirePermission(viewer, rules.read);
    // Chapter scoping (§7.2): the file inherits its parent entity's chapter.
    const parent = await rules.locate(this.prisma, row.entityId);
    assertChapterAccess(viewer.chapter, parent?.chapterState ?? null);
    if (row.sensitivity === 'confidential') {
      this.requirePermission(viewer, CONFIDENTIAL_READ);
      // §7.3 — reads of confidential content are themselves audit-logged.
      await this.audit.logConfidentialRead(viewer.id, 'attachment', id);
    }
    if (!row.data) {
      // fileKey-only rows (future object-storage offload) have no inline bytes.
      throw new NotFoundException('Attachment content is not available');
    }

    return {
      data: Buffer.from(row.data),
      filename: row.filename,
      contentType: row.contentType ?? 'application/octet-stream',
    };
  }

  async softDelete(id: string, user: AuthenticatedUser): Promise<{ ok: true }> {
    const row = await this.prisma.attachment.findFirst({
      where: { id, deletedAt: null },
      select: VIEW_SELECT,
    });
    if (!row) throw new NotFoundException('Attachment not found');

    const rules = this.rulesFor(row.entityType);
    this.requirePermission(user, rules.write);
    // Chapter scoping (§7.2): no deleting another chapter's file.
    const parent = await rules.locate(this.prisma, row.entityId);
    assertChapterAccess(user.chapter, parent?.chapterState ?? null);
    // You cannot delete what you cannot see: confidential attachments require
    // the same special permission that gates listing/downloading them.
    if (row.sensitivity === 'confidential') this.requirePermission(user, CONFIDENTIAL_READ);

    await this.prisma.attachment.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.audit.logDelete(user.id, 'attachment', id, row);
    return { ok: true };
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  private rulesFor(entityType: string): EntityRule {
    const rules = ENTITY_RULES[entityType as AttachmentEntityType];
    // Unknown types can only come from hand-edited rows — refuse loudly.
    if (!rules) throw new ForbiddenException(`Unsupported attachment entity type: ${entityType}`);
    return rules;
  }

  private requirePermission(user: AuthenticatedUser, key: PermissionKey): void {
    if (!user.permissions.has(key)) {
      // Same message shape as PermissionsGuard so the SPA handles both alike.
      throw new ForbiddenException(`Missing permission: ${key}`);
    }
  }
}
