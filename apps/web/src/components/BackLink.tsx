import { ArrowLeft } from 'lucide-react';
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
 * Breadcrumb that honors router back-state and falls back to the area list.
 * Without a fallback it renders only when back-state is present — for pages
 * that normally have no breadcrumb of their own.
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
  const to = back?.to ?? fallbackTo;
  if (!to) return null;
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="h-3.5 w-3.5" /> {back?.label ?? fallbackLabel}
    </Link>
  );
}
