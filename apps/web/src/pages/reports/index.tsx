import { Route, Routes } from 'react-router-dom';
import { ReportRunnerPage } from './ReportRunnerPage';
import { ReportsCatalogPage } from './ReportsCatalogPage';

/** Mounted at 'reports/*'. */
export function ReportsRoutes() {
  return (
    <Routes>
      <Route index element={<ReportsCatalogPage />} />
      <Route path=":key" element={<ReportRunnerPage />} />
    </Routes>
  );
}
