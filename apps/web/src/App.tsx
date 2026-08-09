import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageLoader } from '@/components/ui/spinner';
import { useAuth } from '@/lib/auth';
import { useBuildVersionWatch } from '@/lib/build-version';
import { ForgotPasswordPage } from '@/pages/ForgotPasswordPage';
import { LoginPage } from '@/pages/LoginPage';
import { PortalPage } from '@/pages/portal';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { ResetPasswordPage } from '@/pages/ResetPasswordPage';
import { moduleRoutes } from '@/routes';

export default function App() {
  const { user, isLoading } = useAuth();
  // Pick up a deploy without the user having to know to reload (pinned web
  // apps otherwise keep an old bundle alive for days).
  useBuildVersionWatch();

  if (isLoading) return <PageLoader />;

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
      {/* Self-service password reset (§3.1) — public, like /login. */}
      <Route
        path="/forgot-password"
        element={user ? <Navigate to="/" replace /> : <ForgotPasswordPage />}
      />
      <Route
        path="/reset-password/:token"
        element={user ? <Navigate to="/" replace /> : <ResetPasswordPage />}
      />
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
