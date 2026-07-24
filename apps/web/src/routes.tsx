import type { PermissionKey } from '@jumpstart/shared';
import { Route } from 'react-router-dom';
import { RequirePermissionRoute } from '@/components/RequirePermissionRoute';
import { PlaceholderPage } from '@/pages/PlaceholderPage';

/**
 * Central route registry. Each module's screens live under src/pages/<area>/
 * and are wired here with their gating permission — mirroring the API's
 * module × permission structure. Placeholder entries are replaced as module
 * screens land.
 */

const gate = (permission: PermissionKey, element: React.ReactNode) => (
  <RequirePermissionRoute permission={permission}>{element}</RequirePermissionRoute>
);

export const moduleRoutes = (
  <>
    <Route index element={gate('dashboard.read', <PlaceholderPage title="Dashboard" />)} />
    <Route
      path="participants/*"
      element={gate('participants.read', <PlaceholderPage title="Participants" />)}
    />
    <Route
      path="institutions/*"
      element={gate('institutions.read', <PlaceholderPage title="Institutions" />)}
    />
    <Route
      path="inside-classes/*"
      element={gate('inside_classes.read', <PlaceholderPage title="Inside Classes" />)}
    />
    <Route
      path="outside-programs/*"
      element={gate('outside_programs.read', <PlaceholderPage title="Outside Programs" />)}
    />
    <Route path="housing/*" element={gate('housing.read', <PlaceholderPage title="Housing" />)} />
    <Route
      path="case-management/*"
      element={gate('case_management.read', <PlaceholderPage title="Case Management" />)}
    />
    <Route
      path="volunteers/*"
      element={gate('volunteers.read', <PlaceholderPage title="Volunteers" />)}
    />
    <Route
      path="mentoring/*"
      element={gate('mentoring.read', <PlaceholderPage title="Alumni & Mentoring" />)}
    />
    <Route
      path="intake/*"
      element={gate('intake_queues.read', <PlaceholderPage title="Intake Queues" />)}
    />
    <Route path="donors/*" element={gate('donors.read', <PlaceholderPage title="Donors" />)} />
    <Route
      path="campaigns/*"
      element={gate('campaigns.read', <PlaceholderPage title="Campaigns" />)}
    />
    <Route path="events/*" element={gate('events.read', <PlaceholderPage title="Events" />)} />
    <Route path="vendors/*" element={gate('vendors.read', <PlaceholderPage title="Vendors" />)} />
    <Route
      path="employers/*"
      element={gate('employers.read', <PlaceholderPage title="Employers" />)}
    />
    <Route path="vehicles/*" element={gate('vehicles.read', <PlaceholderPage title="Vehicles" />)} />
    <Route path="reports/*" element={gate('reports.read', <PlaceholderPage title="Reports" />)} />
    <Route path="admin/*" element={gate('admin.users', <PlaceholderPage title="Administration" />)} />
  </>
);
