import type { PermissionKey } from '@jumpstart/shared';
import { Navigate, NavLink, Outlet, Route, Routes } from 'react-router-dom';
import { EmptyState } from '@/components/ui/spinner';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { AuditLogPage } from './AuditLogPage';
import { RolesPage } from './RolesPage';
import { SettingsPage } from './SettingsPage';
import { TemplatesPage } from './TemplatesPage';
import { UsersPage } from './UsersPage';

const SECTIONS: { path: string; label: string; permission: PermissionKey }[] = [
  { path: 'users', label: 'Users', permission: 'admin.users' },
  { path: 'roles', label: 'Roles', permission: 'admin.roles' },
  { path: 'audit', label: 'Audit Log', permission: 'audit.read' },
  { path: 'settings', label: 'Settings', permission: 'admin.settings' },
  { path: 'templates', label: 'Templates', permission: 'admin.templates' },
];

function AdminLayout() {
  const { can } = useAuth();
  const visible = SECTIONS.filter((s) => can(s.permission));

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Administration</h1>
      <nav className="flex flex-wrap items-center gap-1 border-b pb-2">
        {visible.map((s) => (
          <NavLink
            key={s.path}
            to={s.path}
            className={({ isActive }) =>
              cn(
                'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              )
            }
          >
            {s.label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}

/** Lands on the first section the user's permissions allow. */
function AdminIndexRedirect() {
  const { can } = useAuth();
  const first = SECTIONS.find((s) => can(s.permission));
  if (!first) {
    return (
      <EmptyState
        title="No administrative access"
        hint="Your account does not hold any administration permissions."
      />
    );
  }
  return <Navigate to={first.path} replace />;
}

/** Mounted at 'admin/*'. */
export function AdminRoutes() {
  return (
    <Routes>
      <Route element={<AdminLayout />}>
        <Route index element={<AdminIndexRedirect />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="roles" element={<RolesPage />} />
        <Route path="audit" element={<AuditLogPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="templates" element={<TemplatesPage />} />
        <Route path="*" element={<Navigate to="." replace />} />
      </Route>
    </Routes>
  );
}
