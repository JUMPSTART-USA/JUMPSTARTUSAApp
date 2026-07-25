import { Route, Routes } from 'react-router-dom';
import { ExpirationsPage } from './ExpirationsPage';
import { FacilityRequirementsPage } from './FacilityRequirementsPage';
import { VolunteerDetailPage } from './VolunteerDetailPage';
import { VolunteerListPage } from './VolunteerListPage';

/** Mounted at 'volunteers/*'. */
export function VolunteersRoutes() {
  return (
    <Routes>
      <Route index element={<VolunteerListPage />} />
      <Route path="expirations" element={<ExpirationsPage />} />
      <Route path="facility-requirements" element={<FacilityRequirementsPage />} />
      <Route path=":id" element={<VolunteerDetailPage />} />
    </Routes>
  );
}
