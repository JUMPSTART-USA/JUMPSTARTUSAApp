import type { PermissionKey } from '@jumpstart/shared';
import { Route } from 'react-router-dom';
import { RequirePermissionRoute } from '@/components/RequirePermissionRoute';
import { AdminRoutes } from '@/pages/admin';
import { CaseManagementRoutes } from '@/pages/case-management';
import { CampaignsRoutes, DonorsRoutes, EventsRoutes, VendorsRoutes } from '@/pages/crm';
import { DashboardRoutes } from '@/pages/dashboard';
import { EmployersRoutes } from '@/pages/employment';
import { VehiclesRoutes } from '@/pages/fleet';
import { HousingRoutes } from '@/pages/housing';
import { InsideClassesRoutes } from '@/pages/inside-classes';
import { InstitutionsRoutes } from '@/pages/institutions';
import { IntakeRoutes } from '@/pages/intake';
import { MentoringRoutes } from '@/pages/mentoring';
import { OutsideProgramsRoutes } from '@/pages/outside-programs';
import { ParticipantsRoutes } from '@/pages/participants';
import { CommunicationsRoutes } from './pages/communications';
import { ReportsRoutes } from '@/pages/reports';
import { SupportRoutes } from '@/pages/support';
import { VolunteersRoutes } from '@/pages/volunteers';

/**
 * Central route registry. Each module's screens live under src/pages/<area>/
 * and are wired here with their gating permission — mirroring the API's
 * module × permission structure.
 */

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
