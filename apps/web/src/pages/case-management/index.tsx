import { NavLink, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { CaseloadSummaryPage } from './CaseloadSummaryPage';
import { CaseManagementHome } from './CaseManagementHome';
import { CaseNotesPage } from './CaseNotesPage';
import { CaseServicesPage } from './CaseServicesPage';
import { NeedsAssessmentsPage } from './NeedsAssessmentsPage';
import { OnboardingPage } from './OnboardingPage';
import { ReferralsPage } from './ReferralsPage';
import { ServicePlansPage } from './ServicePlansPage';
import { TasksPage } from './TasksPage';

const SECTIONS: { to: string; label: string; end?: boolean }[] = [
  { to: '.', label: 'Follow-ups', end: true },
  { to: 'notes', label: 'Case Notes' },
  { to: 'services', label: 'Services' },
  { to: 'plans', label: 'Service Plans' },
  { to: 'tasks', label: 'Tasks' },
  { to: 'referrals', label: 'Referrals' },
  { to: 'assessments', label: 'Assessments' },
  { to: 'onboarding', label: 'Onboarding' },
  { to: 'caseload', label: 'Caseload' },
];

function CaseManagementLayout() {
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight">Case Management</h1>
      <nav className="flex flex-wrap gap-1 border-b pb-2">
        {SECTIONS.map((s) => (
          <NavLink
            key={s.to}
            to={s.to}
            end={s.end}
            className={({ isActive }) =>
              cn(
                'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground',
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

export function CaseManagementRoutes() {
  return (
    <Routes>
      <Route element={<CaseManagementLayout />}>
        <Route index element={<CaseManagementHome />} />
        <Route path="notes" element={<CaseNotesPage />} />
        <Route path="services" element={<CaseServicesPage />} />
        <Route path="plans" element={<ServicePlansPage />} />
        <Route path="tasks" element={<TasksPage />} />
        <Route path="referrals" element={<ReferralsPage />} />
        <Route path="assessments" element={<NeedsAssessmentsPage />} />
        <Route path="onboarding" element={<OnboardingPage />} />
        <Route path="caseload" element={<CaseloadSummaryPage />} />
        <Route path="*" element={<Navigate to="." replace />} />
      </Route>
    </Routes>
  );
}
