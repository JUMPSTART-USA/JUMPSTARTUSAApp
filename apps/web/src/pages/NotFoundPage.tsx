import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="flex h-64 flex-col items-center justify-center gap-3">
      <p className="text-4xl font-bold">404</p>
      <p className="text-muted-foreground">That page doesn&apos;t exist.</p>
      <Link
        to="/"
        className="inline-flex h-9 items-center rounded-md border border-input bg-card px-4 text-sm font-medium hover:bg-accent"
      >
        Back to dashboard
      </Link>
    </div>
  );
}

export function ForbiddenPage() {
  return (
    <div className="flex h-64 flex-col items-center justify-center gap-3">
      <p className="text-4xl font-bold">403</p>
      <p className="text-muted-foreground">
        Your role doesn&apos;t include access to this area. Ask an administrator if you believe this
        is a mistake.
      </p>
    </div>
  );
}
