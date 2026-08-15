import { Injectable, Logger } from '@nestjs/common';
import type { AuditAction, Prisma } from '@jumpstart/database';
import { PrismaService } from '../prisma/prisma.service';
import { currentAuditContext } from './request-context';

export interface AuditEntry {
  userId?: string | null;
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  oldValues?: unknown;
  newValues?: unknown;
  metadata?: Record<string, unknown>;
}

// Fields never written into audit rows even when a caller passes full records.
const REDACTED_FIELDS = new Set(['passwordHash', 'totpSecret', 'sess']);

function sanitize(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  return JSON.parse(
    JSON.stringify(value, (key, v) => {
      if (REDACTED_FIELDS.has(key)) return '[redacted]';
      return v;
    }),
  ) as Prisma.InputJsonValue;
}

/**
 * The single audit write path (§4.1.5). Every mutation, login, export and
 * permission change goes through here. Rows are append-only — no update or
 * delete method exists on this service, and no permission grants one.
 *
 * Audit writes must never take the primary operation down: failures are
 * logged loudly but not rethrown.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(entry: AuditEntry): Promise<void> {
    // Picked up from the request the caller is already inside — see
    // request-context.ts for why this is not a parameter.
    const { ipAddress, userAgent } = currentAuditContext();
    try {
      await this.prisma.auditLog.create({
        data: {
          userId: entry.userId ?? null,
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId ?? null,
          oldValues: sanitize(entry.oldValues),
          newValues: sanitize(entry.newValues),
          metadata: sanitize(entry.metadata),
          ipAddress,
          userAgent,
        },
      });
    } catch (err) {
      /**
       * Still swallowed: auditing must never take the primary operation down.
       * But a silent failure leaves the log quietly incomplete, which is worse
       * than a loud one — hence the stable "AUDIT WRITE FAILED" prefix.
       * Application Insights is wired up in both deployed environments; alert
       * on that string there, because nobody reads container logs on a normal
       * day.
       */
      this.logger.error(
        `AUDIT WRITE FAILED action=${entry.action} entity=${entry.entityType}:${entry.entityId}`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  /** Convenience helpers so call sites stay one-liners. */
  logCreate(userId: string, entityType: string, entityId: string, newValues: unknown) {
    return this.log({ userId, action: 'create', entityType, entityId, newValues });
  }

  logUpdate(
    userId: string,
    entityType: string,
    entityId: string,
    oldValues: unknown,
    newValues: unknown,
  ) {
    return this.log({
      userId,
      action: 'update',
      entityType,
      entityId,
      oldValues: diffOld(oldValues, newValues),
      newValues: diffNew(oldValues, newValues),
    });
  }

  logDelete(userId: string, entityType: string, entityId: string, oldValues?: unknown) {
    return this.log({ userId, action: 'delete', entityType, entityId, oldValues });
  }

  logExport(userId: string, entityType: string, metadata: Record<string, unknown>) {
    return this.log({ userId, action: 'export', entityType, metadata });
  }

  /** §7.3 — reads of confidential case notes are themselves audit-logged. */
  logConfidentialRead(userId: string, entityType: string, entityId: string) {
    return this.log({ userId, action: 'read_confidential', entityType, entityId });
  }
}

/** Store only the fields that actually changed, old side. */
function diffOld(oldValues: unknown, newValues: unknown): Record<string, unknown> | undefined {
  return diff(oldValues, newValues, 'old');
}
/** Store only the fields that actually changed, new side. */
function diffNew(oldValues: unknown, newValues: unknown): Record<string, unknown> | undefined {
  return diff(oldValues, newValues, 'new');
}

function diff(
  oldValues: unknown,
  newValues: unknown,
  side: 'old' | 'new',
): Record<string, unknown> | undefined {
  if (!isRecord(oldValues) || !isRecord(newValues)) {
    return side === 'old' ? (oldValues as Record<string, unknown>) : (newValues as Record<string, unknown>);
  }
  const out: Record<string, unknown> = {};
  for (const key of new Set([...Object.keys(oldValues), ...Object.keys(newValues)])) {
    const before = normalize(oldValues[key]);
    const after = normalize(newValues[key]);
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      out[key] = side === 'old' ? before : after;
    }
  }
  return Object.keys(out).length ? out : undefined;
}

function normalize(v: unknown): unknown {
  if (v instanceof Date) return v.toISOString();
  return v ?? null;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v) && !(v instanceof Date);
}
