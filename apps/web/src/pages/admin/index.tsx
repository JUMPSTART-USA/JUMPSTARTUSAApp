import type { PermissionKey } from '@jumpstart/shared';
import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/spinner';
import { SubNav } from '@/components/ui/sub-nav';
import { useAuth } from '@/lib/auth';
import { AuditLogPage } from './AuditLogPage';
import { MergePage } from './MergePage';
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
  { path: 'merge', label: 'Merge People', permission: 'person.merge' },
];

function AdminLayout() {
  const { can } = useAuth();
  const visible = SECTIONS.filter((s) => can(s.permission));

  return (
    <div className="space-y-4">
      <PageHeader title="Administration" />
      <SubNav items={visible.map((s) => ({ to: s.path, label: s.label }))} />
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
        <Route path="merge" element={<MergePage />} />
        <Route path="*" element={<Navigate to="." replace />} />
      </Route>
    </Routes>
  );
}
