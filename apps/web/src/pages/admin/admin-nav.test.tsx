import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

/**
 * Admin's sub-navigation pointed one level too deep in production: every tab
 * resolved to /admin/users/<section> instead of /admin/<section>. Users looked
 * fine because the index redirect lands on it directly, so the bug only showed
 * when you clicked anything else — the section rendered its frame with no body,
 * and reloading did not help because the URL itself was wrong.
 *
 * The cause is that Admin is the only module without a real index route. The
 * others ('.' as their first tab) sit at the module root, so relative links
 * resolve correctly from there; Admin redirects to its first section, so the
 * browser is always one level down. These assertions pin the resulting hrefs,
 * which is the part a reader cannot verify by eye.
 */
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ can: () => true }) }));

// The section pages fetch on mount; the nav is what is under test.
vi.mock('./UsersPage', () => ({ UsersPage: () => <p>users page</p> }));
vi.mock('./RolesPage', () => ({ RolesPage: () => <p>roles page</p> }));
vi.mock('./AuditLogPage', () => ({ AuditLogPage: () => <p>audit page</p> }));
vi.mock('./ClientErrorsPage', () => ({ ClientErrorsPage: () => <p>client errors page</p> }));
vi.mock('./SettingsPage', () => ({ SettingsPage: () => <p>settings page</p> }));
vi.mock('./TemplatesPage', () => ({ TemplatesPage: () => <p>templates page</p> }));
vi.mock('./MergePage', () => ({ MergePage: () => <p>merge page</p> }));

const { AdminRoutes } = await import('./index');

/** Mounted exactly as routes.tsx does it — under a splat, which is the detail
 *  that made relative links resolve one level too deep. */
function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="admin/*" element={<AdminRoutes />} />
      </Routes>
    </MemoryRouter>,
  );
}

const EXPECTED: [string, string][] = [
  ['Users', '/admin/users'],
  ['Roles', '/admin/roles'],
  ['Audit Log', '/admin/audit'],
  ['Client Errors', '/admin/client-errors'],
  ['Settings', '/admin/settings'],
  ['Templates', '/admin/templates'],
  ['Merge People', '/admin/merge'],
];

describe('admin sub-navigation', () => {
  it.each(EXPECTED)('links %s to %s from the users tab', (label, href) => {
    renderAt('/admin/users');
    expect(screen.getByRole('link', { name: label }).getAttribute('href')).toBe(href);
  });

  it('keeps the same targets from a non-default tab', () => {
    renderAt('/admin/settings');
    for (const [label, href] of EXPECTED) {
      expect(screen.getByRole('link', { name: label }).getAttribute('href')).toBe(href);
    }
  });

  it('renders the section that the URL names, not just the first one', () => {
    renderAt('/admin/roles');
    expect(screen.getByText('roles page')).toBeTruthy();
  });

  it('sends a bare /admin to the first permitted section', () => {
    renderAt('/admin');
    expect(screen.getByText('users page')).toBeTruthy();
  });
});
