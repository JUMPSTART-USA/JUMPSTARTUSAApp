import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { BackLink } from '@/components/BackLink';
import { PageHeader } from '@/components/ui/page-header';
import { SubNav } from '@/components/ui/sub-nav';
import { BatchesPage } from './BatchesPage';
import { HistoryPage } from './HistoryPage';

const SECTIONS: { to: string; label: string; end?: boolean }[] = [
  { to: '.', label: 'History', end: true },
  { to: 'batches', label: 'Batches' },
];

function CommunicationsLayout() {
  return (
    <div className="space-y-5">
      {/* Renders only when arriving via a deep link that carries back-state. */}
      <BackLink />
      <PageHeader title="Communications" />
      <SubNav items={SECTIONS} />
      <Outlet />
    </div>
  );
}

/** Mounted by the app router at /communications/* (mirrors CaseManagementRoutes). */
export function CommunicationsRoutes() {
  return (
    <Routes>
      <Route element={<CommunicationsLayout />}>
        <Route index element={<HistoryPage />} />
        <Route path="batches" element={<BatchesPage />} />
        <Route path="*" element={<Navigate to="." replace />} />
      </Route>
    </Routes>
  );
}
