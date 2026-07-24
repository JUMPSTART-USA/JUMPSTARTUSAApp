import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ALL_PERMISSIONS } from '@jumpstart/shared';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';

const VALID_PERMISSION_KEYS = new Set<string>(ALL_PERMISSIONS);

const ROLE_INCLUDE = {
  rolePermissions: { include: { permission: true } },
  _count: { select: { userRoles: true } },
} as const;

@Injectable()
export class AdminRolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list() {
    const roles = await this.prisma.role.findMany({
      include: ROLE_INCLUDE,
      orderBy: { name: 'asc' },
    });
    return roles.map((role) => this.toRoleView(role));
  }

  /**
   * Replace a role's permission set wholesale. Every key is validated against
   * ALL_PERMISSIONS — the one source of truth shared with the SPA (§6.14).
   */
  async setPermissions(roleId: string, permissionKeys: string[], userId: string) {
    const role = await this.prisma.role.findUnique({
      where: { id: roleId },
      include: ROLE_INCLUDE,
    });
    if (!role) throw new NotFoundException('Role not found');

    // Admin holds every permission by definition — editing it risks lockout.
    if (role.key === 'admin') {
      throw new BadRequestException('The admin role always holds every permission');
    }

    const unique = [...new Set(permissionKeys)];
    const invalid = unique.filter((k) => !VALID_PERMISSION_KEYS.has(k));
    if (invalid.length) {
      throw new BadRequestException(`Unknown permission key(s): ${invalid.join(', ')}`);
    }

    const oldKeys = role.rolePermissions.map((rp) => rp.permission.key).sort();

    const updated = await this.prisma.$transaction(async (tx) => {
      // Permission rows are seeded from ALL_PERMISSIONS; create defensively so
      // a not-yet-reseeded environment cannot 500 on a valid key.
      const existing = await tx.permission.findMany({ where: { key: { in: unique } } });
      const existingKeys = new Set(existing.map((p) => p.key));
      for (const key of unique.filter((k) => !existingKeys.has(k))) {
        existing.push(await tx.permission.create({ data: { key, createdById: userId } }));
      }

      await tx.rolePermission.deleteMany({ where: { roleId } });
      if (existing.length) {
        await tx.rolePermission.createMany({
          data: existing.map((p) => ({ roleId, permissionId: p.id })),
        });
      }
      await tx.role.update({ where: { id: roleId }, data: { updatedById: userId } });

      return tx.role.findUniqueOrThrow({ where: { id: roleId }, include: ROLE_INCLUDE });
    });

    await this.audit.log({
      userId,
      action: 'permission_change',
      entityType: 'role',
      entityId: roleId,
      oldValues: { permissionKeys: oldKeys },
      newValues: { permissionKeys: [...unique].sort() },
    });

    return this.toRoleView(updated);
  }

  private toRoleView(role: {
    id: string;
    key: string;
    name: string;
    description: string | null;
    isSystem: boolean;
    rolePermissions: { permission: { key: string } }[];
    _count: { userRoles: number };
  }) {
    return {
      id: role.id,
      key: role.key,
      name: role.name,
      description: role.description,
      isSystem: role.isSystem,
      permissionKeys: role.rolePermissions.map((rp) => rp.permission.key).sort(),
      userCount: role._count.userRoles,
    };
  }
}
