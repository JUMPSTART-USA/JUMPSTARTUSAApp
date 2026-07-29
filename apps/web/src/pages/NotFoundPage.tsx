import { Link } from 'react-router-dom';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** Shared EmptyState-style screen for the 404/403 routes. */
function ErrorScreen({ code, message }: { code: string; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed bg-card px-6 py-16 text-center">
      <p className="font-display text-3xl font-semibold tracking-tight">{code}</p>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">{message}</p>
      <Link to="/" className={cn(buttonVariants(), 'mt-4')}>
        Back to dashboard
      </Link>
    </div>
  );
}

export function NotFoundPage() {
  return <ErrorScreen code="404" message="That page doesn't exist." />;
}

export function ForbiddenPage() {
  return (
    <ErrorScreen
      code="403"
      message="Your role doesn't include access to this area. Ask an administrator if you believe this is a mistake."
    />
  );
}
