import { Route, Routes } from 'react-router-dom';
import { EmployerProfilePage } from './EmployerProfilePage';
import { EmployersListPage } from './EmployersListPage';
import { EmploymentsListPage } from './EmploymentsListPage';

export function EmployersRoutes() {
  return (
    <Routes>
      <Route index element={<EmployersListPage />} />
      <Route path="employments" element={<EmploymentsListPage />} />
      <Route path=":id" element={<EmployerProfilePage />} />
    </Routes>
  );
}
