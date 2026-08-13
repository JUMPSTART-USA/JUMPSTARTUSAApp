import { useEffect, useSyncExternalStore, type HTMLAttributes, type ReactNode } from 'react';
import { cn, nodeText } from '@/lib/utils';

const APP_NAME = 'JUMPSTART USA';

/**
 * The current page's heading, published as a subscribable value.
 *
 * AppLayout announces route changes to screen readers, and it used to get the
 * name by READING `document.title` when the pathname changed — correct only
 * while every route rendered synchronously, because effects run child-first and
 * the destination's PageHeader had therefore already run.
 *
 * The module routes are lazy now. On a first visit the destination has not
 * mounted when the pathname changes, so that read returns the PREVIOUS page's
 * name and announces it. A signal fixes the ordering rather than papering over
 * it: the announcement fires when the title actually arrives, however long the
 * chunk takes.
 */
let currentTitle = '';
const titleListeners = new Set<() => void>();

function publishTitle(title: string) {
  if (title === currentTitle) return;
  currentTitle = title;
  for (const listener of titleListeners) listener();
}

function subscribeToTitle(onChange: () => void) {
  titleListeners.add(onChange);
  return () => {
    titleListeners.delete(onChange);
  };
}

/** The heading of the page currently mounted; '' until the first one renders. */
export function useCurrentPageTitle(): string {
  return useSyncExternalStore(subscribeToTitle, () => currentTitle, () => currentTitle);
}

/**
 * Standard page header for every screen: one title size, one layout.
 * Actions wrap below the title on small screens.
 *
 * It also owns the document title. Every route previously shared one static
 * <title>, so every browser tab, bookmark and history entry was identical and a
 * screen reader announced nothing on navigation. This is the one component that
 * already knows each page's name, which makes it the right place to set it —
 * rather than repeating a title in 173 page files. Pass `documentTitle` when the
 * heading is too long or too dynamic to read well in a tab.
 */
export function PageHeader({
  title,
  description,
  actions,
  className,
  documentTitle,
  children,
  ...props
}: Omit<HTMLAttributes<HTMLDivElement>, 'title'> & {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  documentTitle?: string;
}) {
  const heading = documentTitle ?? nodeText(title);
  useEffect(() => {
    document.title = heading ? `${heading} · ${APP_NAME}` : `${APP_NAME} Operations Platform`;
    // Same value, two consumers: the browser chrome reads document.title, and
    // AppLayout's live region subscribes to this.
    publishTitle(heading);
  }, [heading]);

  return (
    <div
      className={cn('flex flex-wrap items-start justify-between gap-x-4 gap-y-3', className)}
      {...props}
    >
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
        {children}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/** Section heading inside a page (below the PageHeader). */
export function SectionHeader({
  title,
  description,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-x-4 gap-y-2', className)}>
      <div className="min-w-0">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
