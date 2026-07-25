import { Route, Routes } from 'react-router-dom';
import { ParticipantCreatePage } from './ParticipantCreatePage';
import { ParticipantListPage } from './ParticipantListPage';
import { ParticipantProfilePage } from './ParticipantProfilePage';

/** Mounted at 'participants/*'. */
export function ParticipantsRoutes() {
  return (
    <Routes>
      <Route index element={<ParticipantListPage />} />
      <Route path="new" element={<ParticipantCreatePage />} />
      <Route path=":id" element={<ParticipantProfilePage />} />
    </Routes>
  );
}
