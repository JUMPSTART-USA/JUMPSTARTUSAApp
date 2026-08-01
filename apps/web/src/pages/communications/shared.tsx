import { useQuery } from '@tanstack/react-query';
import type { CommChannel } from '@jumpstart/shared';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { api, qs, type Paged } from '@/lib/api';
import { humanize } from '@/lib/utils';
import type { TemplateRow } from './types';

/** humanize('sms') → 'Sms', so channels get explicit labels. */
export const CHANNEL_LABELS: Record<CommChannel, string> = {
  email: 'Email',
  sms: 'SMS',
  letter: 'Letter',
};

/**
 * Delivery + batch status colors. The kit's StatusBadge map doesn't cover the
 * communication statuses (queued/sent/delivered/returned, batch draft), so
 * this module maps them onto Badge variants directly.
 */
const COMM_STATUS_VARIANTS: Record<string, BadgeProps['variant']> = {
  draft: 'outline',
  queued: 'secondary',
  sent: 'info',
  delivered: 'success',
  failed: 'destructive',
  returned: 'warning',
};

export function CommStatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) return <span className="text-muted-foreground">—</span>;
  return <Badge variant={COMM_STATUS_VARIANTS[status] ?? 'secondary'}>{humanize(status)}</Badge>;
}

/**
 * Active templates for select controls, optionally narrowed to one channel.
 * Small dataset — one page of 200 sorted by name.
 */
export function useActiveTemplates(channel?: string) {
  return useQuery({
    queryKey: ['communications', 'templates', 'options', channel || 'all'],
    queryFn: () =>
      api.get<Paged<TemplateRow>>(
        `/communications/templates${qs({
          active: true,
          channel: channel || undefined,
          pageSize: 200,
          sortBy: 'name',
          sortDir: 'asc',
        })}`,
      ),
    staleTime: 60_000,
  });
}

/** Subject when present, else the opening of the body — list-cell summary. */
export function messageSummary(subject: string | null, body: string): string {
  if (subject) return subject;
  return body.length > 60 ? `${body.slice(0, 60)}…` : body;
}
