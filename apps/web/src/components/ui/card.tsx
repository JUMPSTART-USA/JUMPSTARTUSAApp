import type { HTMLAttributes, MouseEvent } from 'react';
import { cn } from '@/lib/utils';

/**
 * The card surface as a class string, so a REAL element can wear a card.
 *
 * `Card` is a plain div — not forwardRef, no `as`, no `asChild`, and there is no
 * @radix-ui/react-slot in this app to add one with. That left exactly two ways
 * to build a navigable card and the app shipped both: a div wearing
 * `role="link" tabIndex={0}` (the dashboard — fifteen of them and not one
 * anchor) and an anchor wrapping a Card (mentoring). Which is how the two ended
 * up disagreeing about what the Space key does, and why neither offered
 * cmd-click, middle-click, or a status-bar URL on hover.
 *
 * Exporting the string is the third way, and the one this kit already ruled for:
 * `buttonVariants` is exported for exactly this reason and worn by a `<Link>` in
 * NotFoundPage. One constant rather than a copy in stat.tsx, so a card and a
 * card-shaped link cannot drift apart on the radius or the shadow.
 */
export const cardSurface = 'rounded-xl border bg-card text-card-foreground shadow-card';

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn(cardSurface, className)} {...props} />;
}

/**
 * Click-anywhere for a container whose REAL navigation is a link inside it.
 *
 * The correct shape for a clickable card is DataTable's: put the anchor on the
 * thing that names the record, and keep the container click as pointer
 * convenience only. The two guards are what make that shape safe rather than
 * merely plausible — modified clicks return, so cmd-click opens ONE new tab
 * instead of opening a tab AND navigating the current one; and clicks that
 * started on a link or control return, so a plain click on the title does not
 * fire a second time on top of the anchor, and a card's own buttons still work.
 *
 * Lifted from DataTable's `onRowPointer`, which was written for the same
 * problem. The caller supplies `cursor-pointer`; this owns behaviour, not style.
 */
export function cardClickNav(onNavigate: () => void) {
  return (e: MouseEvent<HTMLElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    if ((e.target as HTMLElement).closest('a,button,input,select,textarea,[role="button"]')) return;
    onNavigate();
  };
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col space-y-1 p-5', className)} {...props} />;
}

/** Standard card heading — screens should not need to override its size. */
export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn('flex items-center gap-2 text-base font-semibold leading-tight', className)}
      {...props}
    />
  );
}

export function CardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-sm text-muted-foreground', className)} {...props} />;
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-5 pt-0', className)} {...props} />;
}

export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex items-center gap-2 p-5 pt-0', className)} {...props} />;
}

/** Card header laid out as a row: title/description left, actions right. */
export function CardHeaderRow({
  className,
  title,
  description,
  children,
  ...props
}: Omit<HTMLAttributes<HTMLDivElement>, 'title'> & {
  title: React.ReactNode;
  description?: React.ReactNode;
}) {
  return (
    <div
      className={cn('flex flex-wrap items-center justify-between gap-3 p-5 pb-3', className)}
      {...props}
    >
      <div className="space-y-1">
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </div>
      {children ? <div className="flex items-center gap-2">{children}</div> : null}
    </div>
  );
}
