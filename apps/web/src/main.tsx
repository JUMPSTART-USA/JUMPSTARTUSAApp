import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-sans/700.css';
import '@fontsource/ibm-plex-sans-condensed/500.css';
import '@fontsource/ibm-plex-sans-condensed/600.css';
import '@fontsource/ibm-plex-sans-condensed/700.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import App from './App';
import { RootErrorBoundary } from './components/ErrorBoundary';
import { AuthProvider } from './lib/auth';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
});

/**
 * A data router, not <BrowserRouter> — `useBlocker` is only available under one,
 * and stopping a half-filled form from being thrown away by a sidebar click is
 * the only thing it is here for (see components/ui/unsaved-navigation.tsx).
 *
 * Deliberately ONE catch-all route holding the existing <App /> tree, rather
 * than a route-object translation of it: App's routes are permission-gated per
 * module and its module routes are descendant <Routes>, which keep working
 * unchanged under a data router. Loaders and actions are not adopted — the app
 * fetches through React Query, and mixing the two ways of loading is how a
 * codebase ends up with data arriving from two places at once.
 */
const router = createBrowserRouter([{ path: '*', element: <App /> }]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/**
     * The outermost boundary. AppLayout has its own, which keeps the sidebar
     * alive for an authenticated screen — but by construction that one cannot
     * catch a failure in the public tree (login, the tokenized portal, password
     * reset) or a failure in AppLayout itself, and those are exactly the screens
     * a blank window is worst on: no navigation to escape with.
     */}
    <RootErrorBoundary>
      <QueryClientProvider client={queryClient}>
        {/* AuthProvider sits ABOVE the router (it uses no router hooks) so a
            navigation can never remount it and re-fetch the session. */}
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </QueryClientProvider>
    </RootErrorBoundary>
  </StrictMode>,
);

// PWA: register the (non-caching) service worker so the app is installable.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Installability is progressive enhancement — never block the app.
    });
  });
}
