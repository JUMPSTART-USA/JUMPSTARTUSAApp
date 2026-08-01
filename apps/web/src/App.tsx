import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageLoader } from '@/components/ui/spinner';
import { useAuth } from '@/lib/auth';
import { LoginPage } from '@/pages/LoginPage';
import { PortalPage } from '@/pages/portal';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { moduleRoutes } from '@/routes';

export default function App() {
  const { user, isLoading } = useAuth();

  if (isLoading) return <PageLoader />;

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
      {/* Participant portal: tokenized public page — never requires a session. */}
      <Route path="/portal/:token" element={<PortalPage />} />
      {user ? (
        <Route element={<AppLayout />}>
          {moduleRoutes}
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      ) : (
        <Route path="*" element={<Navigate to="/login" replace />} />
      )}
    </Routes>
  );
}
