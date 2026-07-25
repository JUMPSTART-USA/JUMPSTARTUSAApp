import { NavLink, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { AssignmentDetailPage } from './AssignmentDetailPage';
import { AssignmentsPage } from './AssignmentsPage';
import { EngagementsPage } from './EngagementsPage';
import { MentoringHomePage } from './MentoringHomePage';
import { OutcomeCheckinsPage } from './OutcomeCheckinsPage';
import { ScreeningDetailPage } from './ScreeningDetailPage';
import { ScreeningsPage } from './ScreeningsPage';

/**
 * Area shell: section sub-nav shared by every mentoring screen. Check-ins and
 * engagements belong to the alumni module, so those tabs require alumni.read
 * on top of the route mount's mentoring.read.
 */
function MentoringLayout() {
  const { can } = useAuth();

  const tabs = [
    { to: '.', label: 'Overview', end: true, show: true },
    { to: 'checkins', label: 'Outcome Check-ins', show: can('alumni.read') },
    { to: 'screenings', label: 'Screenings', show: true },
    { to: 'assignments', label: 'Assignments', show: true },
    { to: 'engagements', label: 'Engagements', show: can('alumni.read') },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1 border-b pb-2">
        {tabs
          .filter((t) => t.show)
          .map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                cn(
                  'rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
                  isActive && 'bg-accent font-medium text-foreground',
                )
              }
            >
              {t.label}
            </NavLink>
          ))}
      </div>
      <Outlet />
    </div>
  );
}

export function MentoringRoutes() {
  return (
    <Routes>
      <Route element={<MentoringLayout />}>
        <Route index element={<MentoringHomePage />} />
        <Route path="checkins" element={<OutcomeCheckinsPage />} />
        <Route path="screenings" element={<ScreeningsPage />} />
        <Route path="screenings/:id" element={<ScreeningDetailPage />} />
        <Route path="assignments" element={<AssignmentsPage />} />
        <Route path="assignments/:id" element={<AssignmentDetailPage />} />
        <Route path="engagements" element={<EngagementsPage />} />
        <Route path="*" element={<Navigate to="." replace />} />
      </Route>
    </Routes>
  );
}
