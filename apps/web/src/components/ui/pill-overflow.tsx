import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { cn } from '@/lib/utils';

/**
 * Makes a horizontally scrolling pill bar admit that it is scrolling.
 *
 * The bars already had `overflow-x: auto`, so hidden items were reachable — but
 * nothing said they existed. Case Management has fourteen pills needing ~1,230px
 * of intrinsic width in about 992px at a 1280px window, so six of its fourteen
 * sections (Service Plans, Tasks, Referrals, Assessments, Onboarding, Caseload)
 * simply looked absent on a 13" laptop. Two fixes, both cheap:
 *
 * 1. a fade at whichever edge has more content, so the bar looks scrollable;
 * 2. scrolling the ACTIVE pill into view on mount and whenever it changes, so
 *    landing on a hidden section does not leave its own tab off screen.
 */
export function usePillOverflow<T extends HTMLElement>(activeKey?: string) {
  const ref = useRef<T>(null);
  const [edges, setEdges] = useState({ start: false, end: false });

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    // 2px of slack: sub-pixel layout otherwise leaves a permanent 0.5px fade.
    setEdges({ start: el.scrollLeft > 2, end: el.scrollLeft < max - 2 });
  }, []);

  /**
   * Deliberately NOT scrollIntoView: it walks up to the nearest scrollable
   * ancestor, which for a bar inside the page means it can scroll the whole
   * document (and on a sticky-header page, drag the header around). Setting
   * scrollLeft touches only this element.
   */
  const revealActive = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const active = el.querySelector<HTMLElement>(
      '[data-state="active"],[aria-current="page"],[aria-selected="true"]',
    );
    if (!active) return;
    const left = active.offsetLeft - el.offsetLeft;
    const right = left + active.offsetWidth;
    if (left < el.scrollLeft) el.scrollLeft = Math.max(0, left - 8);
    else if (right > el.scrollLeft + el.clientWidth) el.scrollLeft = right - el.clientWidth + 8;
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    revealActive();
    measure();
    el.addEventListener('scroll', measure, { passive: true });
    const observer = new ResizeObserver(() => {
      measure();
    });
    observer.observe(el);
    return () => {
      el.removeEventListener('scroll', measure);
      observer.disconnect();
    };
    // activeKey re-runs this when the selected pill changes, so the newly active
    // one is scrolled into view even when navigation came from elsewhere.
  }, [measure, revealActive, activeKey]);

  return { ref, edges };
}

/**
 * Wraps a pill bar and paints the edge fades. The fades are aria-hidden and
 * pointer-events-none — decoration over a scroller that is already operable by
 * keyboard, wheel and touch.
 */
export function PillOverflow({
  edges,
  className,
  children,
}: {
  edges: { start: boolean; end: boolean };
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn('relative min-w-0', className)}>
      {children}
      {edges.start ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-0 w-8 rounded-l-lg bg-gradient-to-r from-muted to-transparent"
        />
      ) : null}
      {edges.end ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 w-8 rounded-r-lg bg-gradient-to-l from-muted to-transparent"
        />
      ) : null}
    </div>
  );
}

export type PillRef<T extends HTMLElement> = RefObject<T>;
