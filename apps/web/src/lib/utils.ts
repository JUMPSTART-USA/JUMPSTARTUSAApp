import { clsx, type ClassValue } from 'clsx';
import { format } from 'date-fns';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
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
