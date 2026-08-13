import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { LiveAnnouncer } from '@/components/ui/announcer';
import { PageLoader } from '@/components/ui/spinner';
import { useAuth } from '@/lib/auth';
import { postLoginTarget } from '@/lib/session-return';
import { useBuildVersionWatch } from '@/lib/build-version';
import { ForgotPasswordPage } from '@/pages/ForgotPasswordPage';
import { LoginPage } from '@/pages/LoginPage';
import { PortalPage } from '@/pages/portal';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { ResetPasswordPage } from '@/pages/ResetPasswordPage';
import { moduleRoutes } from '@/routes';

/**
 * The whole signed-in shell — sidebar, header, global search, chapter switcher,
 * the idle-expiry watch — behind one dynamic import.
 *
 * A participant opening a texted portal link has no session and never will, yet
 * used to download every byte of the staff application to read one message. The
 * module routes went lazy in the code-splitting change; this is the layout they
 * hang off, and it is the last thing standing between a public visitor and a
 * small first load.
 *
 * A chunk failure here lands on the RootErrorBoundary in main.tsx, which already
 * knows what a missing chunk means after a deploy.
 */
const AppLayout = lazy(() =>
  import('@/components/layout/AppLayout').then((m) => ({ default: m.AppLayout })),
);

export default function App() {
  const { user, isLoading } = useAuth();
  /**
   * Where a signed-in user gets sent from /login. Read once on mount: this
   * redirect fires the moment `user` appears, and it beats any imperative
   * navigate() the login form could make, so the interrupted path has to be
   * resolved here.
   */
  const returnTarget = postLoginTarget();
  // Pick up a deploy without the user having to know to reload (pinned web
  // apps otherwise keep an old bundle alive for days).
  useBuildVersionWatch();

  return (
    <>
      {/* Above the routes so it covers the authenticated app AND the public
          portal, which submits requests of its own from outside AppLayout. */}
      <LiveAnnouncer />
      <Routes>
        {/*
         * PUBLIC ROUTES RENDER WITHOUT WAITING FOR THE SESSION CHECK.
         *
         * `if (isLoading) return <PageLoader />` used to gate the entire app,
         * so a participant opening a portal link watched a spinner until
         * /auth/me came back 401 — a request that, for them, can only ever fail.
         * They are the one group with no session and no way to get one.
         *
         * The cost is a brief flash of the login form for a signed-in user who
         * types /login by hand, since `user` is null until the check resolves.
         * That is a rare, self-inflicted path; arriving at /login from a 401 has
         * no session to find anyway.
         */}
        <Route
          path="/login"
          element={user ? <Navigate to={returnTarget} replace /> : <LoginPage />}
        />
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
        {isLoading ? (
          /*
           * Everything else still waits, and MUST: redirecting to /login before
           * the session check resolves would bounce an authenticated user out of
           * the deep link they just opened.
           */
          <Route path="*" element={<PageLoader label="Loading your account…" />} />
        ) : user ? (
          <Route
            element={
              <Suspense fallback={<PageLoader label="Loading…" />}>
                <AppLayout />
              </Suspense>
            }
          >
            {moduleRoutes}
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        ) : (
          <Route path="*" element={<Navigate to="/login" replace />} />
        )}
      </Routes>
    </>
  );
}
