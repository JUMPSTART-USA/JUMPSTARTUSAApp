import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/spinner';

/** Temporary stub while module screens are under construction. */
export function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="space-y-4">
      <PageHeader title={title} />
      <EmptyState
        title="Coming together"
        hint="This module's screens are being built. The API behind it is already live."
      />
    </div>
  );
}
