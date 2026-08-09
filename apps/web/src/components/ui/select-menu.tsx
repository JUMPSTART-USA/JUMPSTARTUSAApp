import { ChevronDown } from 'lucide-react';
import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
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
 * This menu opens downward into the page — where there is a full viewport of
 * room — and flips up only when it genuinely does not fit, so placement never
 * depends on OS popup behaviour. Native <select> stays the right choice for
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
  const [flipUp, setFlipUp] = useState(false);
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
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  // Prefer downward; flip only when the menu truly does not fit below.
  useLayoutEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current?.getBoundingClientRect();
    const height = listRef.current?.offsetHeight ?? 0;
    if (trigger) {
      const roomBelow = window.innerHeight - trigger.bottom;
      setFlipUp(roomBelow < height + 8 && trigger.top > roomBelow);
    }
    listRef.current
      ?.querySelector('[data-active="true"]')
      ?.scrollIntoView({ block: 'nearest' });
  }, [open, activeIndex]);

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
      {open ? (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={ariaLabel}
          className={cn(
            'absolute z-50 max-h-72 w-full min-w-max overflow-y-auto rounded-md border bg-card py-1 shadow-lg',
            flipUp ? 'bottom-full mb-1' : 'top-full mt-1',
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
        </ul>
      ) : null}
    </div>
  );
}
