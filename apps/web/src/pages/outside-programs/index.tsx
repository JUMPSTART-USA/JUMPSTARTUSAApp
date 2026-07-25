import { Route, Routes } from 'react-router-dom';
import { OutsideProgramDetailPage } from './OutsideProgramDetailPage';
import { OutsideProgramListPage } from './OutsideProgramListPage';
import { OutsideSessionDetailPage } from './OutsideSessionDetailPage';

/** Mounted at 'outside-programs/*'. */
export function OutsideProgramsRoutes() {
  return (
    <Routes>
      <Route index element={<OutsideProgramListPage />} />
      <Route path="sessions/:sessionId" element={<OutsideSessionDetailPage />} />
      <Route path=":id" element={<OutsideProgramDetailPage />} />
    </Routes>
  );
}
