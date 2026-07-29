import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Notice } from '@/components/ui/notice';

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('h-5 w-5 animate-spin text-muted-foreground', className)} />;
}

export function PageLoader() {
  return (
    <div className="flex h-64 items-center justify-center">
      <Spinner className="h-8 w-8" />
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed bg-card px-6 py-12 text-center">
      <p className="text-sm font-medium">{title}</p>
      {hint ? <p className="mt-1 text-sm text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function ErrorState({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : 'Something went wrong';
  return <Notice variant="error">{message}</Notice>;
}
