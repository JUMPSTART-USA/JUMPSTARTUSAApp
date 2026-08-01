import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Check, Copy, ExternalLink } from 'lucide-react';
import { useState } from 'react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeaderRow } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input, Label } from '@/components/ui/input';
import { FormError } from '@/components/ui/notice';
import { ErrorState, Spinner } from '@/components/ui/spinner';
import { api, qs } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { applyApiError } from '@/lib/form';
import { formatDate } from '@/lib/utils';

interface PortalTokenRow {
  id: string;
  token: string;
  active: boolean;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

const fmtDateTime = (value: string) => format(new Date(value), 'MMM d, yyyy h:mm a');

/**
 * Participant portal link management for the profile Case Management tab.
 * Reads require participants.read (the profile page's own gate); generate and
 * revoke are gated on participants.update. Generating while a link is active
 * revokes the old token server-side, so that path confirms first.
 */
export function PortalAccessCard({ participantId }: { participantId: string }) {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState<'generate' | 'revoke' | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [topError, setTopError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const canManage = can('participants.update');

  const tokensQuery = useQuery({
    queryKey: ['participants', participantId, 'portal-tokens'],
    queryFn: () =>
      api.get<{ items: PortalTokenRow[] }>(
        `/portal-tokens${qs({ participantProfileId: participantId })}`,
      ),
  });

  const activeToken = tokensQuery.data?.items.find((t) => t.active) ?? null;
  const portalUrl = activeToken ? `${window.location.origin}/portal/${activeToken.token}` : null;

  const onMutationSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ['participants', participantId, 'portal-tokens'] });
    setConfirming(null);
    setCopied(false);
  };

  const generate = useMutation({
    mutationFn: () =>
      api.post<PortalTokenRow>('/portal-tokens', { participantProfileId: participantId }),
    onSuccess: onMutationSuccess,
    onError: (err) => {
      // Same mutation serves the confirmed replace and the bare first-issue
      // button; surface the error wherever the click came from.
      if (confirming) setConfirmError(applyApiError(err));
      else setTopError(applyApiError(err));
    },
  });

  const revoke = useMutation({
    mutationFn: () => api.post(`/portal-tokens/${activeToken?.id}/revoke`),
    onSuccess: onMutationSuccess,
    onError: (err) => setConfirmError(applyApiError(err)),
  });

  const copyLink = () => {
    if (!portalUrl) return;
    void navigator.clipboard.writeText(portalUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card>
      <CardHeaderRow
        title="Portal access"
        description="Tokenized link the participant opens on their phone — no login."
      >
        {canManage && activeToken ? (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setConfirmError(null);
                setConfirming('generate');
              }}
            >
              Generate new link
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => {
                setConfirmError(null);
                setConfirming('revoke');
              }}
            >
              Revoke
            </Button>
          </>
        ) : null}
      </CardHeaderRow>
      <CardContent>
        {tokensQuery.isLoading ? (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        ) : tokensQuery.error ? (
          <ErrorState error={tokensQuery.error} />
        ) : activeToken && portalUrl ? (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Portal link</Label>
              <div className="flex items-center gap-2">
                <Input
                  readOnly
                  value={portalUrl}
                  className="font-mono text-xs"
                  onFocus={(e) => e.currentTarget.select()}
                />
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Copy portal link"
                  onClick={copyLink}
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
                <a
                  href={portalUrl}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Open portal link"
                  className={buttonVariants({ variant: 'outline', size: 'icon' })}
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Issued {formatDate(activeToken.createdAt)} · Last used{' '}
              {activeToken.lastUsedAt ? fmtDateTime(activeToken.lastUsedAt) : 'never'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              No active portal link. Generate one so this participant can send messages and
              request meetings or rides from their phone.
            </p>
            <FormError message={topError} />
            {canManage ? (
              <Button
                variant="outline"
                disabled={generate.isPending}
                onClick={() => {
                  setTopError(null);
                  generate.mutate();
                }}
              >
                {generate.isPending ? 'Generating…' : 'Generate portal link'}
              </Button>
            ) : null}
          </div>
        )}
      </CardContent>

      <ConfirmDialog
        open={confirming === 'generate'}
        onOpenChange={(open) => !open && setConfirming(null)}
        title="Generate a new portal link?"
        description="The current link stops working immediately — anyone still using it loses access. Share the new link with the participant."
        confirmLabel="Generate new link"
        destructive={false}
        isPending={generate.isPending}
        error={confirmError}
        onConfirm={() => generate.mutate()}
      />
      <ConfirmDialog
        open={confirming === 'revoke'}
        onOpenChange={(open) => !open && setConfirming(null)}
        title="Revoke portal link?"
        description="The participant's link stops working immediately. You can generate a new link at any time."
        confirmLabel="Revoke link"
        isPending={revoke.isPending}
        error={confirmError}
        onConfirm={() => revoke.mutate()}
      />
    </Card>
  );
}
