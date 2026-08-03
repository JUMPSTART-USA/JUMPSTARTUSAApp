import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { RoleKey } from '@jumpstart/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { IS_PUBLIC_KEY } from '../decorators';
import type { AuthenticatedRequest } from '../types';

/**
 * Global auth guard. Loads the user + roles + permissions from the database on
 * every request (no caching): permission changes apply immediately and
 * deactivating a user cuts access on their very next request — the
 * instant-revocation property that justified sessions over JWTs (§3.2).
 */
@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const userId = request.session?.userId;
    if (!userId) throw new UnauthorizedException('Not signed in');

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        userRoles: {
          include: {
            role: { include: { rolePermissions: { include: { permission: true } } } },
          },
        },
        regionScopes: true,
      },
    });

    if (!user || user.deletedAt) throw new UnauthorizedException('Account not found');
    if (user.status !== 'active') {
      throw new ForbiddenException('Account is not active');
    }

    const roles = user.userRoles.map((ur) => ur.role.key as RoleKey);
    let effectiveRoles = roles;
    let permissions = new Set<string>(
      user.userRoles.flatMap((ur) => ur.role.rolePermissions.map((rp) => rp.permission.key)),
    );

    // Admin "view as role" preview: narrow this session's effective access to
    // the previewed role. Honored only while the account really holds admin
    // (a revoked admin falls back to real access on their next request), and
    // loaded from the DB so runtime permission edits are reflected. Because
    // admin holds every permission, the override can only narrow, never widen.
    let viewAsRole: RoleKey | null = null;
    if (request.session.viewAsRole && roles.includes('admin')) {
      const previewRole = await this.prisma.role.findUnique({
        where: { key: request.session.viewAsRole },
        include: { rolePermissions: { include: { permission: true } } },
      });
      if (previewRole) {
        viewAsRole = previewRole.key as RoleKey;
        effectiveRoles = [viewAsRole];
        permissions = new Set(previewRole.rolePermissions.map((rp) => rp.permission.key));
      }
    }

    // One scope row = that chapter; no rows = all chapters (§7.2).
    const scopedChapters = user.regionScopes.map((rs) => rs.state);
    const allowedChapters = scopedChapters.length ? scopedChapters : null;

    // Chapter preview: honored only when the account may view more than one
    // chapter (several scope rows, or none = all) and the previewed chapter is
    // among them — like the role preview, this can only ever narrow access.
    let viewChapter: string | null = null;
    const requestedChapter = request.session.viewChapter;
    if (
      requestedChapter &&
      (allowedChapters === null ||
        (allowedChapters.length > 1 && allowedChapters.includes(requestedChapter)))
    ) {
      viewChapter = requestedChapter;
    }

    request.user = {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      roles: effectiveRoles,
      permissions,
      actualRoles: roles,
      viewAsRole,
      personId: user.personId,
      chapter: viewChapter ?? scopedChapters[0] ?? null,
      actualChapter: scopedChapters[0] ?? null,
      allowedChapters,
      viewChapter,
    };
    return true;
  }
}
