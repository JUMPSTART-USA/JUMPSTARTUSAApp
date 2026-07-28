import { ArrowLeft } from 'lucide-react';
import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';

/**
 * Router state passed by pages that deep-link into another area (e.g. the
 * participant profile tabs) so the destination can offer a Back control to
 * the exact page — and tab — the user came from.
 */
export interface BackNavState {
  back?: { to: string; label: string };
}

export function backTo(to: string, label: string): { state: BackNavState } {
  return { state: { back: { to, label } } };
}

/**
 * In-app screen history. One entry per distinct pathname visit; same-pathname
 * URL changes (tab/filter query strings) update the top entry instead, so
 * "previous screen" always means the previous page, never a previous tab.
 */
const screenStack: { pathname: string; url: string }[] = [];

export function useRecordScreenHistory(): void {
  const location = useLocation();
  useEffect(() => {
    const url = location.pathname + location.search;
    const top = screenStack[screenStack.length - 1];
    if (top && top.pathname === location.pathname) {
      top.url = url;
    } else {
      screenStack.push({ pathname: location.pathname, url });
      if (screenStack.length > 100) screenStack.shift();
    }
  }, [location]);
}

function previousScreenUrl(currentPathname: string): string | null {
  for (let i = screenStack.length - 1; i >= 0; i--) {
    const entry = screenStack[i];
    if (entry && entry.pathname !== currentPathname) return entry.url;
  }
  return null;
}

/**
 * Breadcrumb that returns to the previous screen. Resolution order: explicit
 * router back-state (exact page + label), then the tracked previous screen,
 * then the area-list fallback (deep links / fresh loads). Without a fallback
 * it renders only when one of the dynamic sources is present.
 */
export function BackLink({
  fallbackTo,
  fallbackLabel,
}: {
  fallbackTo?: string;
  fallbackLabel?: string;
}) {
  const location = useLocation();
  const back = (location.state as BackNavState | null)?.back;
  const prev = previousScreenUrl(location.pathname);
  const to = back?.to ?? prev ?? fallbackTo;
  if (!to) return null;
  const label =
    back?.label ??
    (prev && prev.split('?')[0] !== fallbackTo ? 'Back' : fallbackLabel ?? 'Back');
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="h-3.5 w-3.5" /> {label}
    </Link>
  );
}
