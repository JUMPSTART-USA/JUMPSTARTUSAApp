import { Route, Routes } from 'react-router-dom';
import { DashboardPage } from './DashboardPage';

export function DashboardRoutes() {
  return (
    <Routes>
      <Route index element={<DashboardPage />} />
    </Routes>
  );
}
