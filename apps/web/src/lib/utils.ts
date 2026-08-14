import { clsx, type ClassValue } from 'clsx';
import { format } from 'date-fns';
import { isValidElement, type ReactNode } from 'react';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Flatten a node tree to its text, so a composed label like
 * `<>{humanize(status)} participants</>` still yields a usable string.
 * Canonical home for this — FilterSelect and PageHeader both read it.
 */
export function nodeText(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join('');
  if (isValidElement<{ children?: ReactNode }>(node)) return nodeText(node.props.children);
  return '';
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  if (typeof value === 'string') {
    // Date-only values (bare yyyy-mm-dd, or the midnight-UTC DateTime Prisma
    // stores for date inputs) are calendar dates: render the stored date
    // as-is. Converting to local time shifts them a day early in US zones.
    const m = /^(\d{4})-(\d{2})-(\d{2})($|T00:00:00\.000Z$)/.exec(value);
    if (m) {
      return format(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])), 'MMM d, yyyy');
    }
  }
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  return format(d, 'MMM d, yyyy');
}

export function formatMoney(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  const n = typeof value === 'string' ? Number(value) : value;
  if (Number.isNaN(n)) return '—';
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

/** "left_early" → "Left early" — enum values are snake_case everywhere. */
export function humanize(value: string | null | undefined): string {
  if (!value) return '—';
  const s = value.replaceAll('_', ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function fullName(p: {
  firstName: string;
  lastName: string;
  preferredName?: string | null;
}): string {
  const preferred = p.preferredName ? ` “${p.preferredName}”` : '';
  return `${p.firstName}${preferred} ${p.lastName}`;
}

/**
 * Href for a social profile value — full URLs only. Bare handles ("@joe")
 * render as plain text; guessing the profile URL from a handle risks linking
 * to a stranger's page.
 */
export function socialHref(value: string): string | null {
  const v = value.trim();
  return /^https?:\/\//i.test(v) ? v : null;
}
