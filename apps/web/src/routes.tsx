import type { PermissionKey } from '@jumpstart/shared';
import { lazy, type ComponentType } from 'react';
import { Route } from 'react-router-dom';
import { RequirePermissionRoute } from '@/components/RequirePermissionRoute';

/**
 * Central route registry. Each module's screens live under src/pages/<area>/
 * and are wired here with their gating permission — mirroring the API's
 * module × permission structure.
 *
 * These twenty entries are the whole reason the app used to ship as ONE 1.68 MB
 * chunk: statically importing every module barrel puts every screen in the
 * entry, so someone landing on the dashboard downloaded the fleet module, the
 * admin module and the entire CRM before anything rendered. Splitting here is
 * the highest-leverage cut available because no page file has to change.
 *
 * Two properties it leans on, both worth preserving:
 * - `RequirePermissionRoute` renders <ForbiddenPage /> INSTEAD of its children,
 *   so a user without `admin.users` never fetches the admin chunk at all.
 * - The four CRM entries share one specifier, so Rollup emits a single crm
 *   chunk that all four routes reuse.
 *
 * The Suspense boundary these require lives in AppLayout's <main>, with the
 * chunk-load error boundary immediately outside it.
 */

/** Module barrels export NAMED route components; lazy() wants a default. */
const named = <T extends Record<string, unknown>>(loader: () => Promise<T>, key: keyof T & string) =>
  lazy(async () => ({ default: (await loader())[key] as ComponentType }));

const DashboardRoutes = named(() => import('@/pages/dashboard'), 'DashboardRoutes');
const ParticipantsRoutes = named(() => import('@/pages/participants'), 'ParticipantsRoutes');
const SupportRoutes = named(() => import('@/pages/support'), 'SupportRoutes');
const InstitutionsRoutes = named(() => import('@/pages/institutions'), 'InstitutionsRoutes');
const InsideClassesRoutes = named(() => import('@/pages/inside-classes'), 'InsideClassesRoutes');
const OutsideProgramsRoutes = named(
  () => import('@/pages/outside-programs'),
  'OutsideProgramsRoutes',
);
const HousingRoutes = named(() => import('@/pages/housing'), 'HousingRoutes');
const CaseManagementRoutes = named(() => import('@/pages/case-management'), 'CaseManagementRoutes');
const VolunteersRoutes = named(() => import('@/pages/volunteers'), 'VolunteersRoutes');
const MentoringRoutes = named(() => import('@/pages/mentoring'), 'MentoringRoutes');
const IntakeRoutes = named(() => import('@/pages/intake'), 'IntakeRoutes');
const DonorsRoutes = named(() => import('@/pages/crm'), 'DonorsRoutes');
const CampaignsRoutes = named(() => import('@/pages/crm'), 'CampaignsRoutes');
const EventsRoutes = named(() => import('@/pages/crm'), 'EventsRoutes');
const VendorsRoutes = named(() => import('@/pages/crm'), 'VendorsRoutes');
const EmployersRoutes = named(() => import('@/pages/employment'), 'EmployersRoutes');
const VehiclesRoutes = named(() => import('@/pages/fleet'), 'VehiclesRoutes');
const CommunicationsRoutes = named(() => import('@/pages/communications'), 'CommunicationsRoutes');
const ReportsRoutes = named(() => import('@/pages/reports'), 'ReportsRoutes');
const AdminRoutes = named(() => import('@/pages/admin'), 'AdminRoutes');

const gate = (permission: PermissionKey, element: React.ReactNode) => (
  <RequirePermissionRoute permission={permission}>{element}</RequirePermissionRoute>
);

export const moduleRoutes = (
  <>
    <Route index element={gate('dashboard.read', <DashboardRoutes />)} />
    <Route
      path="participants/*"
      element={gate('participants.read', <ParticipantsRoutes />)}
    />
    <Route path="support/*" element={gate('support.access', <SupportRoutes />)} />
    <Route
      path="institutions/*"
      element={gate('institutions.read', <InstitutionsRoutes />)}
    />
    <Route
      path="inside-classes/*"
      element={gate('inside_classes.read', <InsideClassesRoutes />)}
    />
    <Route
      path="outside-programs/*"
      element={gate('outside_programs.read', <OutsideProgramsRoutes />)}
    />
    <Route path="housing/*" element={gate('housing.read', <HousingRoutes />)} />
    <Route
      path="case-management/*"
      element={gate('case_management.read', <CaseManagementRoutes />)}
    />
    <Route
      path="volunteers/*"
      element={gate('volunteers.read', <VolunteersRoutes />)}
    />
    <Route
      path="mentoring/*"
      element={gate('mentoring.read', <MentoringRoutes />)}
    />
    <Route
      path="intake/*"
      element={gate('intake_queues.read', <IntakeRoutes />)}
    />
    <Route path="donors/*" element={gate('donors.read', <DonorsRoutes />)} />
    <Route
      path="campaigns/*"
      element={gate('campaigns.read', <CampaignsRoutes />)}
    />
    <Route path="events/*" element={gate('events.read', <EventsRoutes />)} />
    <Route path="vendors/*" element={gate('vendors.read', <VendorsRoutes />)} />
    <Route
      path="employers/*"
      element={gate('employers.read', <EmployersRoutes />)}
    />
    <Route path="vehicles/*" element={gate('vehicles.read', <VehiclesRoutes />)} />
    <Route
      path="communications/*"
      element={gate('communications.read', <CommunicationsRoutes />)}
    />
    <Route path="reports/*" element={gate('reports.read', <ReportsRoutes />)} />
    <Route path="admin/*" element={gate('admin.users', <AdminRoutes />)} />
  </>
);
