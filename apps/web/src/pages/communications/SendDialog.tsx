import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { COMM_CHANNELS, sendCommunicationSchema, type CommChannel } from '@jumpstart/shared';
import { ChapterSelect } from '@/components/ChapterSelect';
import { FormField } from '@/components/FormField';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input, Select, Textarea } from '@/components/ui/input';
import { FormError } from '@/components/ui/notice';
import { api } from '@/lib/api';
import { applyApiError, formResolver } from '@/lib/form';
import { PersonSearch, type PersonHit } from '@/pages/crm/shared';
import { CHANNEL_LABELS, useActiveTemplates } from './shared';
import type { CommunicationRow } from './types';

/**
 * One-off send (§6.12): pick a person and channel, then either an active
 * template (previewed read-only) or an ad-hoc subject/body. Suppression
 * (do-not-contact, missing consent/address) is enforced server-side and
 * surfaces here as a top-of-form error.
 */

interface SendFormValues {
  personId: string;
  channel: string;
  templateId: string;
  subject: string;
  body: string;
  chapterState: string;
}

export function SendDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [topError, setTopError] = useState('');
  const [person, setPerson] = useState<PersonHit | null>(null);

  const { register, handleSubmit, getValues, setValue, setError, watch, reset, formState } =
    useForm<SendFormValues>({ resolver: formResolver(sendCommunicationSchema) });

  const channel = watch('channel');
  const templateId = watch('templateId');

  const templates = useActiveTemplates(channel);
  const template = templates.data?.items.find((t) => t.id === templateId) ?? null;

  useEffect(() => {
    if (open) {
      setTopError('');
      setPerson(null);
      reset({
        personId: '',
        channel: 'email',
        templateId: '',
        subject: '',
        body: '',
        chapterState: '',
      });
    }
  }, [open, reset]);

  const send = useMutation({
    mutationFn: () => {
      // The schema output drops ''-valued optionals; build the payload from
      // raw values so the request matches POST /communications/send exactly.
      const raw = getValues();
      return api.post<CommunicationRow & { warning?: string }>('/communications/send', {
        personId: raw.personId,
        channel: raw.channel as CommChannel,
        templateId: raw.templateId || undefined,
        subject:
          raw.templateId || raw.channel !== 'email' ? undefined : raw.subject.trim() || undefined,
        body: raw.templateId ? undefined : raw.body.trim() || undefined,
        // Chapter (§7.2): only all-chapters users see the picker; the server
        // prefers the recipient's own chapter and uses this as the fallback.
        chapterState: raw.chapterState || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['communications'] });
      onClose();
    },
    onError: (err) => setTopError(applyApiError(err, setError) ?? ''),
  });

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Send message</DialogTitle>
          <DialogDescription>
            Send a one-off message to a single person. Do-not-contact and consent rules are
            enforced automatically.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={handleSubmit(() => {
            setTopError('');
            send.mutate();
          })}
        >
          <input type="hidden" {...register('personId')} />
          <FormField label="Person" required error={formState.errors.personId}>
            <PersonSearch
              selected={person}
              onSelect={(hit) => {
                setPerson(hit);
                setValue('personId', hit?.personId ?? '', { shouldValidate: !!hit });
              }}
            />
          </FormField>
          {/* Chapter (§7.2) — all-chapters users only; the message is stamped
              with the recipient's own chapter when they have one, and this
              pick covers recipients with no derivable chapter. */}
          <ChapterSelect
            error={formState.errors.chapterState}
            hint="Used when the recipient has no chapter of their own."
            {...register('chapterState', { setValueAs: (v) => (v === '' ? undefined : v) })}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Channel" required error={formState.errors.channel}>
              <Select
                {...register('channel', {
                  onChange: () => {
                    // Templates are channel-specific; a stale pick must not survive.
                    setValue('templateId', '');
                  },
                })}
              >
                {COMM_CHANNELS.map((c) => (
                  <option key={c} value={c}>
                    {CHANNEL_LABELS[c]}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField
              label="Template"
              error={formState.errors.templateId}
              hint={templateId ? undefined : 'Optional — leave blank to write an ad-hoc message.'}
            >
              <Select {...register('templateId')}>
                <option value="">Ad-hoc message…</option>
                {(templates.data?.items ?? []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>

          {template ? (
            <div className="space-y-1.5 rounded-md border bg-muted/40 px-3 py-2.5">
              {template.subject ? (
                <p className="text-sm font-medium">{template.subject}</p>
              ) : null}
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">{template.body}</p>
              <p className="text-xs text-muted-foreground">
                Merge fields like {'{{firstName}}'} fill in per person when the message sends.
              </p>
            </div>
          ) : (
            <>
              {channel === 'email' ? (
                <FormField label="Subject" required error={formState.errors.subject}>
                  <Input {...register('subject')} />
                </FormField>
              ) : null}
              <FormField label="Message" required error={formState.errors.body}>
                <Textarea rows={6} {...register('body')} />
              </FormField>
            </>
          )}

          <FormError message={topError} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={formState.isSubmitting || send.isPending}>
              {send.isPending ? 'Sending…' : 'Send'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
