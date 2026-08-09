import { ChevronDown } from 'lucide-react';
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

export interface SelectMenuOption {
  value: string;
  label: string;
}

/**
 * Dropdown that renders its menu IN THE PAGE instead of using the native
 * <select> popup.
 *
 * Why this exists: macOS positions a native select's popup so the SELECTED row
 * sits over the control. For a control pinned near the top of the window — the
 * header's role/chapter switchers sit ~10px down — choosing a value low in the
 * list pushes the popup off the top of the window, and every row above the
 * window edge becomes unreachable. With 7 chapters and Texas selected the popup
 * wants to start ~110px above the viewport, which left only the last couple of
 * options clickable. It was worse in a pinned web app (no browser toolbar to
 * add slack above the page), fine on iOS (which uses a sheet) and fine on
 * Windows (which clamps popups on screen).
 *
 * The list is PORTALLED to <body> and positioned in viewport coordinates, so no
 * ancestor can clip, mis-stack or mis-composite it — the header it belongs to is
 * inside a sticky, stacking-context container, and an installed (Dock) web app
 * proved to behave differently there than a normal Safari tab. It opens downward
 * when there is room, flips up otherwise, and is clamped on-screen, so placement
 * never depends on OS popup behaviour either. Native <select> stays the right choice for
 * form fields inside dialogs: they sit mid-screen with room in both directions.
 *
 * Keyboard: Enter/Space/Arrow opens, Arrows/Home/End move the highlight,
 * Enter/Space commits, Escape closes. Focus stays on the trigger and the active
 * option is advertised with aria-activedescendant.
 */
export function SelectMenu({
  value,
  options,
  onChange,
  'aria-label': ariaLabel,
  className,
  dark,
  disabled,
}: {
  value: string;
  options: SelectMenuOption[];
  onChange: (value: string) => void;
  'aria-label': string;
  className?: string;
  /** Navy sidebar styling, matching the DARK_SELECT treatment. */
  dark?: boolean;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  // Fixed viewport coordinates for the portalled menu.
  const [pos, setPos] = useState<{ top: number; left: number; minWidth: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  const selectedIndex = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  const current = options[selectedIndex];

  // Close on an outside pointer press, as any menu should.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      // The list is portalled to <body>, so it is not inside containerRef.
      if (containerRef.current?.contains(target) || listRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  /**
   * Place the menu in viewport coordinates: below the trigger when there is
   * room, above it otherwise, and clamped so it can never sit off-screen.
   */
  const place = useCallback(() => {
    const trigger = triggerRef.current?.getBoundingClientRect();
    if (!trigger) return;
    const height = listRef.current?.offsetHeight ?? 0;
    const gap = 4;
    const roomBelow = window.innerHeight - trigger.bottom;
    const above = roomBelow < height + gap && trigger.top > roomBelow;
    // Viewport-relative placement, then converted to DOCUMENT coordinates: the
    // menu is positioned `absolute`, not `fixed`. A fixed element forces its own
    // viewport-sized composited layer, and WebKit stops painting those past a
    // large window size — which is why an installed web app lost the menu only
    // when its window grew beyond roughly 3350x2270. Absolute positioning never
    // takes that path.
    const viewportTop = above
      ? Math.max(gap, trigger.top - height - gap)
      : Math.min(trigger.bottom + gap, window.innerHeight - height - gap);
    const width = Math.max(trigger.width, listRef.current?.offsetWidth ?? 0);
    const viewportLeft = Math.min(Math.max(gap, trigger.left), window.innerWidth - width - gap);
    setPos({
      top: viewportTop + window.scrollY,
      left: viewportLeft + window.scrollX,
      minWidth: trigger.width,
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    place();
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [open, activeIndex, place]);

  /**
   * The trigger can sit in a sticky header, so a document-anchored menu would
   * drift away from it as the page scrolls: close on scroll (what most menus
   * do) and re-place on resize.
   */
  useEffect(() => {
    if (!open) return;
    const onScroll = () => setOpen(false);
    const onResize = () => place();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open, place]);

  const commit = (next: string) => {
    setOpen(false);
    if (next !== value) onChange(next);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setActiveIndex(selectedIndex);
        setOpen(true);
      }
      return;
    }
    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        setOpen(false);
        break;
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex((i) => Math.min(options.length - 1, i + 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex((i) => Math.max(0, i - 1));
        break;
      case 'Home':
        e.preventDefault();
        setActiveIndex(0);
        break;
      case 'End':
        e.preventDefault();
        setActiveIndex(options.length - 1);
        break;
      case 'Enter':
      case ' ': {
        e.preventDefault();
        const option = options[activeIndex];
        if (option) commit(option.value);
        break;
      }
      case 'Tab':
        setOpen(false);
        break;
      default:
        break;
    }
  };

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? `${listId}-${activeIndex}` : undefined}
        onClick={() => {
          setActiveIndex(selectedIndex);
          setOpen((o) => !o);
        }}
        onKeyDown={onKeyDown}
        className={cn(
          'flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-card px-3 text-left text-sm shadow-sm transition-colors focus-visible:border-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
          dark && 'border-white/20 bg-white/10 text-white',
        )}
      >
        <span className="truncate">{current?.label ?? ''}</span>
        <ChevronDown className="h-4 w-4 shrink-0 opacity-60" aria-hidden="true" />
      </button>
      {open
        ? createPortal(
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={ariaLabel}
          style={{
            position: 'absolute',
            top: pos?.top ?? -9999,
            left: pos?.left ?? -9999,
            minWidth: pos?.minWidth,
            visibility: pos ? 'visible' : 'hidden',
          }}
          className={cn(
            'z-[100] max-h-72 min-w-max overflow-y-auto rounded-md border bg-card py-1 shadow-lg',
            dark && 'border-white/20 bg-navy-deep text-white',
          )}
        >
          {options.map((option, index) => (
            <li
              key={option.value}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={option.value === value}
              data-active={index === activeIndex}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => commit(option.value)}
              className={cn(
                'cursor-pointer px-3 py-1.5 text-sm',
                index === activeIndex && (dark ? 'bg-white/10' : 'bg-accent'),
                option.value === value && 'font-medium',
              )}
            >
              {option.label}
            </li>
          ))}
        </ul>,
        document.body,
          )
        : null}
    </div>
  );
}
