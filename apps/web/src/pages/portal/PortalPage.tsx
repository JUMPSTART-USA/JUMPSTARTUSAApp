/**
 * Public participant portal — tokenized link, no login, no session. Wired at
 * /portal/:token OUTSIDE the authed layout (alongside /login), so it must
 * render standalone: no AppLayout, no auth context reads, and it never
 * redirects to /login (see ./portal-api for why it avoids the shared `api`
 * wrapper). Mobile-first: participants open this from a text message.
 */
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import logoWhite from '@/assets/brand/jumpstart-logo-white.png';
import { Button } from '@/components/ui/button';
import { PageLoader } from '@/components/ui/spinner';
import { ApiError } from '@/lib/api';
import { portalApi } from './portal-api';
import { MeetingCard, MessageCard, TransportCard } from './request-cards';

export function PortalPage() {
  const { token = '' } = useParams<{ token: string }>();

  const identity = useQuery({
    queryKey: ['portal', token],
    queryFn: () => portalApi.identity(token),
    enabled: token.length > 0,
    retry: false,
    staleTime: Infinity,
  });

  const linkDead =
    token.length === 0 || (identity.error instanceof ApiError && identity.error.status === 404);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="bg-gradient-to-br from-navy-deep to-navy px-4 pb-8 pt-6">
        <div className="mx-auto w-full max-w-2xl">
          <img src={logoWhite} alt="JUMPSTART USA" className="w-40" />
          {identity.data ? (
            <div className="mt-6">
              <h1 className="text-2xl font-semibold text-white">
                Hi {identity.data.firstName} — how can we help?
              </h1>
              <p className="mt-1 text-sm text-white/70">
                Participant {identity.data.participantNumber}
              </p>
            </div>
          ) : null}
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 space-y-4 px-4 py-6">
        {identity.isLoading && !linkDead ? (
          <PageLoader />
        ) : linkDead ? (
          <div className="rounded-xl border bg-card px-6 py-12 text-center shadow-card">
            <p className="text-base font-medium">This link is no longer active.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Please contact your case manager for a new one.
            </p>
          </div>
        ) : identity.isError ? (
          <div className="rounded-xl border bg-card px-6 py-12 text-center shadow-card">
            <p className="text-base font-medium">Something went wrong.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Please check your connection and try again.
            </p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => {
                void identity.refetch();
              }}
            >
              Try again
            </Button>
          </div>
        ) : identity.data ? (
          <>
            <MessageCard token={token} />
            <MeetingCard token={token} />
            <TransportCard token={token} />
          </>
        ) : null}
      </main>

      <footer className="px-4 pb-8 text-center text-xs text-muted-foreground">
        JUMPSTART USA · If this isn’t you, please close this page.
      </footer>
    </div>
  );
}
