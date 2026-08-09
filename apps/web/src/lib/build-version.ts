import { useEffect } from 'react';

declare const __BUILD_ID__: string;

/**
 * Reload the app when a newer build has been deployed.
 *
 * A pinned/Dock web app keeps the same page alive for days — macOS restores it
 * on launch without re-fetching — so a deploy can go live and the user keeps
 * operating on the old bundle, unaware. That cost real debugging time: fixes
 * were verified live on the server while the installed app still ran the code
 * they replaced. Ordinary browser tabs hit this too, just less often.
 *
 * Vite compiles the build id in and emits the same value at /version.txt, so a
 * running client can compare the two. The check runs when the app becomes
 * visible or regains focus — the moment a user returns, which is a safe point
 * to reload — and once at startup. Deliberately NOT on a timer: reloading
 * underneath someone mid-form would lose their work.
 */
export function useBuildVersionWatch(): void {
  useEffect(() => {
    if (!import.meta.env.PROD) return;
    let cancelled = false;

    const check = async () => {
      try {
        const res = await fetch('/version.txt', { cache: 'no-store' });
        if (!res.ok) return;
        const served = (await res.text()).trim();
        // An empty or HTML body means the file is missing — never reload on that.
        if (cancelled || !served || served.includes('<') || served === __BUILD_ID__) return;
        window.location.reload();
      } catch {
        // Offline or a blip: the next focus will try again.
      }
    };

    const onReturn = () => {
      if (document.visibilityState === 'visible') void check();
    };

    void check();
    document.addEventListener('visibilitychange', onReturn);
    window.addEventListener('focus', onReturn);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onReturn);
      window.removeEventListener('focus', onReturn);
    };
  }, []);
}
