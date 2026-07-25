import { Route, Routes } from 'react-router-dom';
import { HomeDetailPage } from './HomeDetailPage';
import { HousingPage } from './HousingPage';

/** Mounted at 'housing/*'. */
export function HousingRoutes() {
  return (
    <Routes>
      <Route index element={<HousingPage />} />
      <Route path="homes/:id" element={<HomeDetailPage />} />
    </Routes>
  );
}
