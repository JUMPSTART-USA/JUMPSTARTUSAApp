import type { PermissionKey } from '@jumpstart/shared';
import type { ReactNode } from 'react';
import { ForbiddenPage } from '@/pages/NotFoundPage';
import { useAuth } from '@/lib/auth';

/**
 * Route-level permission gate. UX only — every API endpoint re-checks
 * server-side (§7.1); this just avoids rendering screens that will 403.
 */
export function RequirePermissionRoute({
  permission,
  children,
}: {
  permission: PermissionKey;
  children: ReactNode;
}) {
  const { can } = useAuth();
  if (!can(permission)) return <ForbiddenPage />;
  return <>{children}</>;
}
