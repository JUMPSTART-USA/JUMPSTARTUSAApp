import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { BackLink } from '@/components/BackLink';
import { PageHeader } from '@/components/ui/page-header';
import { SubNav } from '@/components/ui/sub-nav';
import { CaseloadSummaryPage } from './CaseloadSummaryPage';
import { CaseManagementHome } from './CaseManagementHome';
import { CaseNotesPage } from './CaseNotesPage';
import { CaseServicesPage } from './CaseServicesPage';
import { DrugTestsPage } from './DrugTestsPage';
import { NeedsAssessmentsPage } from './NeedsAssessmentsPage';
import { OnboardingPage } from './OnboardingPage';
import { ReferralsPage } from './ReferralsPage';
import { ServicePlansPage } from './ServicePlansPage';
import { TasksPage } from './TasksPage';

const SECTIONS: { to: string; label: string; end?: boolean }[] = [
  { to: '.', label: 'Follow-ups', end: true },
  { to: 'notes', label: 'Case Notes' },
  { to: 'services', label: 'Services' },
  { to: 'drug-tests', label: 'Drug Tests' },
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
      {/* Renders only when arriving via a deep link that carries back-state
          (e.g. from a participant record). */}
      <BackLink />
      <PageHeader title="Case Management" />
      <SubNav items={SECTIONS} />
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
        <Route path="drug-tests" element={<DrugTestsPage />} />
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
