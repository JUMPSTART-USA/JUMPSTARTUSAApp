// Minimal service worker: exists to make the app installable (Chromium
// requires one). Deliberately does NO caching — every request passes through
// to the network, so deploys are always picked up on reload and there is no
// stale-bundle risk. Offline support is a future, deliberate project.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {
  // Intentionally empty: not calling respondWith() lets the browser handle
  // the request exactly as if no service worker existed.
});
