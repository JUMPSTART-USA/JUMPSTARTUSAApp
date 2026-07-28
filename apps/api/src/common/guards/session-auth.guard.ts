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
    const permissions = new Set<string>(
      user.userRoles.flatMap((ur) => ur.role.rolePermissions.map((rp) => rp.permission.key)),
    );

    request.user = {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      roles,
      permissions,
      personId: user.personId,
      // One scope row = that chapter; no rows = all chapters (§7.2).
      chapter: user.regionScopes[0]?.state ?? null,
    };
    return true;
  }
}
