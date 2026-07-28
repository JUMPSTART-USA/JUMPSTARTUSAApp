import { participantCreateSchema, type ParticipantCreateInput } from '@jumpstart/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorState } from '@/components/ui/spinner';
import { api, ApiError } from '@/lib/api';
import { formatDate, fullName, humanize } from '@/lib/utils';
import {
  emptyParticipantFormValues,
  PersonFields,
  ProfileFields,
  type ParticipantFormValues,
} from './person-form';
import { AmberNotice, applyApiError, schemaResolver, useCaseManagerOptions } from './shared';
import type { DuplicateCandidate, ParticipantDetail } from './types';
import { BackLink } from '@/components/BackLink';

export function ParticipantCreatePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { options: cmOptions } = useCaseManagerOptions();

  const form = useForm<ParticipantFormValues>({
    resolver: schemaResolver<ParticipantFormValues>(participantCreateSchema),
    defaultValues: emptyParticipantFormValues(),
  });

  const [candidates, setCandidates] = useState<DuplicateCandidate[] | null>(null);
  const [topError, setTopError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const createMutation = useMutation({
    mutationFn: (body: ParticipantCreateInput) => api.post<ParticipantDetail>('/participants', body),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: ['participants'] });
      navigate(`/participants/${created.id}`, { replace: true });
    },
  });

  /**
   * §5 duplicate prevention: run /participants/duplicate-check before the
   * person-creating POST; candidates block until the user reviews them and
   * explicitly creates anyway (confirmNotDuplicate).
   */
  const submit = (confirmNotDuplicate: boolean) =>
    form.handleSubmit(async (raw) => {
      // handleSubmit hands back the schema-parsed output (dates coerced).
      const input = raw as unknown as ParticipantCreateInput;
      setTopError(null);
      setBusy(true);
      try {
        if (!confirmNotDuplicate) {
          const { candidates: found } = await api.post<{ candidates: DuplicateCandidate[] }>(
            '/participants/duplicate-check',
            {
              firstName: input.person.firstName,
              lastName: input.person.lastName,
              dateOfBirth: input.person.dateOfBirth,
              phone: input.person.primaryPhone,
              email: input.person.primaryEmail,
            },
          );
          if (found.length > 0) {
            setCandidates(found);
            window.scrollTo({ top: 0, behavior: 'smooth' });
            return;
          }
        }
        await createMutation.mutateAsync({ ...input, confirmNotDuplicate });
      } catch (err) {
        // The create endpoint re-checks and can 409 with its own candidates.
        if (err instanceof ApiError && err.status === 409) {
          const body = err.body as { candidates?: DuplicateCandidate[] } | undefined;
          if (body?.candidates?.length) {
            setCandidates(body.candidates);
            window.scrollTo({ top: 0, behavior: 'smooth' });
            return;
          }
        }
        const message = applyApiError(err, form.setError);
        if (message) setTopError(message);
      } finally {
        setBusy(false);
      }
    })();

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <BackLink fallbackTo="/participants" fallbackLabel="Participants" />
        <h1 className="mt-1 text-2xl font-semibold">New participant</h1>
      </div>

      {candidates ? (
        <AmberNotice>
          <p className="font-medium">This person may already exist</p>
          <p className="mt-1">
            Review the matching records below. Open an existing record instead of creating a
            duplicate, or continue if this really is a different person.
          </p>
          <ul className="mt-3 space-y-2">
            {candidates.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-200 bg-white/60 px-3 py-2"
              >
                <div>
                  <span className="font-medium">{fullName(c)}</span>
                  <span className="ml-2 text-xs">
                    {[
                      c.dateOfBirth ? `DOB ${formatDate(c.dateOfBirth)}` : null,
                      c.primaryPhone,
                      c.primaryEmail,
                      [c.city, c.state].filter(Boolean).join(', ') || null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                  <span className="ml-2 inline-flex gap-1">
                    {c.profileTypes.map((t) => (
                      <Badge key={t} variant="outline">
                        {humanize(t)}
                      </Badge>
                    ))}
                  </span>
                </div>
                {c.participantProfileId ? (
                  <Link
                    to={`/participants/${c.participantProfileId}`}
                    className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                  >
                    Open {c.participantNumber ?? 'existing record'}
                  </Link>
                ) : (
                  <span className="text-xs text-amber-800">
                    Existing person without a participant profile
                  </span>
                )}
              </li>
            ))}
          </ul>
          <div className="mt-3 flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setCandidates(null)}>
              Go back and review
            </Button>
            <Button size="sm" disabled={busy} onClick={() => void submit(true)}>
              Not a duplicate — create anyway
            </Button>
          </div>
        </AmberNotice>
      ) : null}

      {topError ? <ErrorState error={new Error(topError)} /> : null}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit(false);
        }}
        className="space-y-4"
      >
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Person</CardTitle>
          </CardHeader>
          <CardContent>
            <PersonFields form={form} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Program profile</CardTitle>
          </CardHeader>
          <CardContent>
            <ProfileFields form={form} cmOptions={cmOptions} mode="create" />
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => navigate('/participants')}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Create participant'}
          </Button>
        </div>
      </form>
    </div>
  );
}
