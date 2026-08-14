import { Route, Routes } from 'react-router-dom';
import { AccountPage } from './AccountPage';

export function AccountRoutes() {
  return (
    <Routes>
      <Route index element={<AccountPage />} />
    </Routes>
  );
}
