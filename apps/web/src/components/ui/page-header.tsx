import { useEffect, type HTMLAttributes, type ReactNode } from 'react';
import { cn, nodeText } from '@/lib/utils';

const APP_NAME = 'JUMPSTART USA';

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
