import { Route, Routes } from 'react-router-dom';
import { InstitutionListPage } from './InstitutionListPage';
import { InstitutionProfilePage } from './InstitutionProfilePage';

export function InstitutionsRoutes() {
  return (
    <Routes>
      <Route index element={<InstitutionListPage />} />
      <Route path=":id" element={<InstitutionProfilePage />} />
    </Routes>
  );
}
