import { useQuery, keepPreviousData } from '@tanstack/react-query';
import {
  ArrowRightLeft,
  Award,
  Briefcase,
  ChevronLeft,
  ChevronRight,
  FileText,
  GraduationCap,
  HandHeart,
  Home,
  Mail,
  School,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, PageLoader } from '@/components/ui/spinner';
import { api, qs, type Paged } from '@/lib/api';
import { formatDate, humanize } from '@/lib/utils';
import type { TimelineEventRow } from './types';

const TYPE_ICONS: Record<TimelineEventRow['type'], LucideIcon> = {
  inside_enrollment: School,
  outside_enrollment: GraduationCap,
  housing_enrollment: Home,
  case_note: FileText,
  case_service: HandHeart,
  employment: Briefcase,
  status_change: ArrowRightLeft,
  communication: Mail,
  alumni_engagement: Award,
};

const PAGE_SIZE = 25;

/**
 * §6.1 workflow 4: the unioned feed of everything that ever happened to a
 * participant, newest first. Confidential note stubs come through as-is.
 */
export function TimelineTab({ participantId }: { participantId: string }) {
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ['participants', participantId, 'timeline', page],
    queryFn: () =>
      api.get<Paged<TimelineEventRow>>(
        `/participants/${participantId}/timeline${qs({ page, pageSize: PAGE_SIZE })}`,
      ),
    placeholderData: keepPreviousData,
  });

  if (query.isLoading) return <PageLoader />;
  if (query.error) return <ErrorState error={query.error} />;
  const data = query.data;
  if (!data || data.items.length === 0) return <EmptyState title="No activity recorded yet" />;

  const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <ol className="relative space-y-6 border-l pl-8">
        {data.items.map((e) => {
          const Icon = TYPE_ICONS[e.type];
          const isConfidentialStub = e.title === '[Confidential note]';
          return (
            <li key={`${e.type}-${e.entityId}`} className="relative">
              <span className="absolute -left-[43px] flex h-6 w-6 items-center justify-center rounded-full border bg-card">
                <Icon className="h-3 w-3 text-muted-foreground" />
              </span>
              <div className="text-xs text-muted-foreground">
                {formatDate(e.date)} · {humanize(e.type)}
              </div>
              <div
                className={
                  isConfidentialStub ? 'text-sm italic text-muted-foreground' : 'text-sm font-medium'
                }
              >
                {e.title}
              </div>
              {e.detail ? (
                <p className="mt-0.5 line-clamp-3 whitespace-pre-wrap text-sm text-muted-foreground">
                  {e.detail}
                </p>
              ) : null}
            </li>
          );
        })}
      </ol>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {data.total} event{data.total === 1 ? '' : 's'}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            <ChevronLeft className="h-4 w-4" /> Prev
          </Button>
          <span>
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
