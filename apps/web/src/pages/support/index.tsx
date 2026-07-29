import { Route, Routes } from 'react-router-dom';
import { SupportPage } from './SupportPage';
import { TicketDetailPage } from './TicketDetailPage';

export function SupportRoutes() {
  return (
    <Routes>
      <Route index element={<SupportPage />} />
      <Route path=":id" element={<TicketDetailPage />} />
    </Routes>
  );
}
