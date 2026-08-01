import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@jumpstart/database';
import type {
  AttachmentEntityType,
  AttachmentListQuery,
  AttachmentUploadInput,
  PermissionKey,
} from '@jumpstart/shared';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
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
  /** Existence check (respecting the parent's soft delete where it has one). */
  exists: (prisma: PrismaService, id: string) => Promise<{ id: string } | null>;
}

/**
 * THE authorization table (one place): entityType → permission pair + parent
 * lookup. Attachment access always derives from the entity the file hangs on.
 * VolunteerTraining / VolunteerClearance have no deletedAt column, so their
 * checks are plain existence.
 */
const ENTITY_RULES: Record<AttachmentEntityType, EntityRule> = {
  participant_profile: {
    read: 'participants.read',
    write: 'participants.update',
    exists: (prisma, id) =>
      prisma.participantProfile.findFirst({ where: { id, deletedAt: null }, select: { id: true } }),
  },
  case_note: {
    read: 'case_management.read',
    write: 'case_management.update',
    exists: (prisma, id) =>
      prisma.caseNote.findFirst({ where: { id, deletedAt: null }, select: { id: true } }),
  },
  vehicle_maintenance_record: {
    read: 'vehicles.read',
    write: 'vehicles.update',
    exists: (prisma, id) =>
      prisma.vehicleMaintenanceRecord.findFirst({
        where: { id, deletedAt: null },
        select: { id: true },
      }),
  },
  volunteer_training: {
    read: 'volunteers.read',
    write: 'volunteers.update',
    exists: (prisma, id) =>
      prisma.volunteerTraining.findFirst({ where: { id }, select: { id: true } }),
  },
  volunteer_clearance: {
    read: 'volunteers.read',
    write: 'volunteers.update',
    exists: (prisma, id) =>
      prisma.volunteerClearance.findFirst({ where: { id }, select: { id: true } }),
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

    const entity = await rules.exists(this.prisma, input.entityId);
    if (!entity) throw new NotFoundException(`${input.entityType} not found`);

    const created = await this.prisma.attachment.create({
      data: {
        entityType: input.entityType,
        entityId: input.entityId,
        // Copy into a fresh Uint8Array: Prisma's Bytes input is typed
        // Uint8Array<ArrayBuffer>, while Buffer is Uint8Array<ArrayBufferLike>.
        data: new Uint8Array(file.buffer),
        filename: input.filename ?? file.originalname,
        contentType: file.mimetype,
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
