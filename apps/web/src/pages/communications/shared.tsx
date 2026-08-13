import { useQuery } from '@tanstack/react-query';
import type { CommChannel } from '@jumpstart/shared';
import { StatusBadge } from '@/components/ui/badge';
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

/**
 * Every communication status now lives in the kit's STATUS_VARIANTS — none of
 * them collided with an existing key, so the badges are unchanged. Re-exported
 * under the old name so call sites read the same.
 */
export const CommStatusBadge = StatusBadge;
