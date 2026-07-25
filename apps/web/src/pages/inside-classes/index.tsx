import { Route, Routes } from 'react-router-dom';
import { InsideClassCloseOutPage } from './InsideClassCloseOutPage';
import { InsideClassDetailPage } from './InsideClassDetailPage';
import { InsideClassListPage } from './InsideClassListPage';

export function InsideClassesRoutes() {
  return (
    <Routes>
      <Route index element={<InsideClassListPage />} />
      <Route path=":id" element={<InsideClassDetailPage />} />
      <Route path=":id/close-out" element={<InsideClassCloseOutPage />} />
    </Routes>
  );
}
