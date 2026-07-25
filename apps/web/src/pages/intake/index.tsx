import { Navigate, Route, Routes } from 'react-router-dom';
import { IntakeQueuesPage } from './IntakeQueuesPage';

export function IntakeRoutes() {
  return (
    <Routes>
      <Route index element={<IntakeQueuesPage />} />
      <Route path="*" element={<Navigate to="." replace />} />
    </Routes>
  );
}
