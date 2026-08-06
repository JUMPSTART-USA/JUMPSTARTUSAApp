import { Route, Routes } from 'react-router-dom';
import { ExpirationsPage } from './ExpirationsPage';
import { FacilityRequirementsPage } from './FacilityRequirementsPage';
import { HoursPage } from './HoursPage';
import { OpportunitiesListPage } from './OpportunitiesListPage';
import { OpportunityDetailPage } from './OpportunityDetailPage';
import { VolunteerDetailPage } from './VolunteerDetailPage';
import { VolunteerListPage } from './VolunteerListPage';

/** Mounted at 'volunteers/*'. */
export function VolunteersRoutes() {
  return (
    <Routes>
      <Route index element={<VolunteerListPage />} />
      <Route path="expirations" element={<ExpirationsPage />} />
      <Route path="facility-requirements" element={<FacilityRequirementsPage />} />
      <Route path="opportunities" element={<OpportunitiesListPage />} />
      <Route path="opportunities/:id" element={<OpportunityDetailPage />} />
      <Route path="hours" element={<HoursPage />} />
      <Route path=":id" element={<VolunteerDetailPage />} />
    </Routes>
  );
}
