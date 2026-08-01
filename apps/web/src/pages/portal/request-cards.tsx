/**
 * The three participant-facing request cards on the portal page. Each card is
 * a self-contained form (react-hook-form + shared schema) that flips to a
 * success pane after submitting, with a "Send another" reset.
 */
import { useMutation } from '@tanstack/react-query';
import { Bus, CalendarClock, MessageSquare } from 'lucide-react';
import { useState } from 'react';
import { useForm, type FieldValues, type UseFormSetError } from 'react-hook-form';
import {
  meetingRequestSchema,
  portalMessageSchema,
  transportRequestSchema,
} from '@jumpstart/shared';
import { FormField } from '@/components/FormField';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Checkbox, Input, Textarea } from '@/components/ui/input';
import { FormError, Notice } from '@/components/ui/notice';
import { ApiError } from '@/lib/api';
import { applyApiError, formResolver, todayInput } from '@/lib/form';
import { portalApi } from './portal-api';

/** Participant-friendly error copy: throttle responses get a plain message. */
function friendlyError<T extends FieldValues>(err: unknown, setError: UseFormSetError<T>): string {
  if (err instanceof ApiError && err.status === 429) return 'Please try again later.';
  return applyApiError(err, setError) ?? '';
}

/** Success pane shared by all three cards. */
function SentPane({
  message,
  againLabel,
  onAgain,
}: {
  message: string;
  againLabel: string;
  onAgain: () => void;
}) {
  return (
    <div className="space-y-3">
      <Notice variant="success">{message}</Notice>
      <Button variant="outline" onClick={onAgain}>
        {againLabel}
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Send a message
// ---------------------------------------------------------------------------

interface MessageFormValues {
  subject: string;
  body: string;
}

export function MessageCard({ token }: { token: string }) {
  const [sent, setSent] = useState(false);
  const [topError, setTopError] = useState('');
  const { register, handleSubmit, getValues, setError, reset, formState } =
    useForm<MessageFormValues>({
      resolver: formResolver<MessageFormValues>(portalMessageSchema),
      defaultValues: { subject: '', body: '' },
    });

  const send = useMutation({
    mutationFn: () => {
      const raw = getValues();
      return portalApi.post(token, '/messages', {
        subject: raw.subject || undefined,
        body: raw.body,
      });
    },
    onSuccess: () => {
      setTopError('');
      setSent(true);
    },
    onError: (err) => setTopError(friendlyError(err, setError)),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <MessageSquare className="h-4 w-4 text-gold-dark" /> Send a message
        </CardTitle>
        <CardDescription>Write to your case manager about anything on your mind.</CardDescription>
      </CardHeader>
      <CardContent>
        {sent ? (
          <SentPane
            message="Message sent — your case manager will follow up."
            againLabel="Send another"
            onAgain={() => {
              reset();
              setTopError('');
              setSent(false);
            }}
          />
        ) : (
          <form className="space-y-4" onSubmit={handleSubmit(() => send.mutate())}>
            <FormField label="Subject" hint="Optional" error={formState.errors.subject}>
              <Input {...register('subject')} placeholder="What is this about?" />
            </FormField>
            <FormField label="Message" required error={formState.errors.body}>
              <Textarea {...register('body')} rows={4} placeholder="Type your message here…" />
            </FormField>
            <FormError message={topError} />
            <Button type="submit" disabled={send.isPending} className="w-full sm:w-auto">
              {send.isPending ? 'Sending…' : 'Send'}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Request a meeting
// ---------------------------------------------------------------------------

interface MeetingFormValues {
  preferredDate: string;
  preferredTime: string;
  reason: string;
}

export function MeetingCard({ token }: { token: string }) {
  const [sent, setSent] = useState(false);
  const [topError, setTopError] = useState('');
  const { register, handleSubmit, getValues, setError, reset, formState } =
    useForm<MeetingFormValues>({
      resolver: formResolver<MeetingFormValues>(meetingRequestSchema),
      defaultValues: { preferredDate: '', preferredTime: '', reason: '' },
    });

  const send = useMutation({
    mutationFn: () => {
      // The resolver parses the date to a Date object; the API expects the raw
      // yyyy-mm-dd input string, so build the payload from raw values.
      const raw = getValues();
      return portalApi.post(token, '/meeting-requests', {
        preferredDate: raw.preferredDate,
        preferredTime: raw.preferredTime || undefined,
        reason: raw.reason,
      });
    },
    onSuccess: () => {
      setTopError('');
      setSent(true);
    },
    onError: (err) => setTopError(friendlyError(err, setError)),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <CalendarClock className="h-4 w-4 text-gold-dark" /> Request a meeting
        </CardTitle>
        <CardDescription>Ask for time with your case manager.</CardDescription>
      </CardHeader>
      <CardContent>
        {sent ? (
          <SentPane
            message="Request sent — your case manager will follow up with a time."
            againLabel="Request another"
            onAgain={() => {
              reset();
              setTopError('');
              setSent(false);
            }}
          />
        ) : (
          <form className="space-y-4" onSubmit={handleSubmit(() => send.mutate())}>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Preferred date" required error={formState.errors.preferredDate}>
                <Input type="date" min={todayInput()} {...register('preferredDate')} />
              </FormField>
              <FormField label="Preferred time" hint="Optional" error={formState.errors.preferredTime}>
                <Input type="time" {...register('preferredTime')} />
              </FormField>
            </div>
            <FormField
              label="What do you want to talk about?"
              required
              error={formState.errors.reason}
            >
              <Textarea {...register('reason')} rows={3} />
            </FormField>
            <FormError message={topError} />
            <Button type="submit" disabled={send.isPending} className="w-full sm:w-auto">
              {send.isPending ? 'Sending…' : 'Send request'}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Request transportation
// ---------------------------------------------------------------------------

interface TransportFormValues {
  tripDate: string;
  tripTime: string;
  destination: string;
  purpose: string;
  returnTripRequested: boolean;
  returnDate: string;
  returnTime: string;
  returnDestination: string;
}

export function TransportCard({ token }: { token: string }) {
  const [sent, setSent] = useState(false);
  const [topError, setTopError] = useState('');
  const { register, handleSubmit, getValues, setError, reset, watch, formState } =
    useForm<TransportFormValues>({
      resolver: formResolver<TransportFormValues>(transportRequestSchema),
      defaultValues: {
        tripDate: '',
        tripTime: '',
        destination: '',
        purpose: '',
        returnTripRequested: false,
        returnDate: '',
        returnTime: '',
        returnDestination: '',
      },
    });
  const returnTrip = watch('returnTripRequested');
  const tripDate = watch('tripDate');

  const send = useMutation({
    mutationFn: () => {
      const raw = getValues();
      const payload: Record<string, unknown> = {
        tripDate: raw.tripDate,
        tripTime: raw.tripTime,
        destination: raw.destination,
        purpose: raw.purpose || undefined,
        returnTripRequested: raw.returnTripRequested,
      };
      if (raw.returnTripRequested) {
        payload.returnDate = raw.returnDate;
        payload.returnTime = raw.returnTime;
        payload.returnDestination = raw.returnDestination;
      }
      return portalApi.post(token, '/transport-requests', payload);
    },
    onSuccess: () => {
      setTopError('');
      setSent(true);
    },
    onError: (err) => setTopError(friendlyError(err, setError)),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <Bus className="h-4 w-4 text-gold-dark" /> Request transportation
        </CardTitle>
        <CardDescription>Tell us where you need to go and when.</CardDescription>
      </CardHeader>
      <CardContent>
        {sent ? (
          <SentPane
            message="Request sent — your case manager will follow up."
            againLabel="Request another"
            onAgain={() => {
              reset();
              setTopError('');
              setSent(false);
            }}
          />
        ) : (
          <form className="space-y-4" onSubmit={handleSubmit(() => send.mutate())}>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Date" required error={formState.errors.tripDate}>
                <Input type="date" min={todayInput()} {...register('tripDate')} />
              </FormField>
              <FormField label="Time" required error={formState.errors.tripTime}>
                <Input type="time" {...register('tripTime')} />
              </FormField>
            </div>
            <FormField label="Destination" required error={formState.errors.destination}>
              <Input {...register('destination')} placeholder="Where do you need to go?" />
            </FormField>
            <FormField label="Purpose" hint="Optional" error={formState.errors.purpose}>
              <Input {...register('purpose')} placeholder="Work, appointment, errand…" />
            </FormField>
            <label className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Checkbox {...register('returnTripRequested')} />
              I need a return trip
            </label>
            {returnTrip ? (
              <div className="space-y-4 rounded-lg border bg-accent/40 p-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField label="Return date" required error={formState.errors.returnDate}>
                    <Input type="date" min={tripDate || todayInput()} {...register('returnDate')} />
                  </FormField>
                  <FormField label="Return time" required error={formState.errors.returnTime}>
                    <Input type="time" {...register('returnTime')} />
                  </FormField>
                </div>
                <FormField
                  label="Return destination"
                  required
                  error={formState.errors.returnDestination}
                >
                  <Input
                    {...register('returnDestination')}
                    placeholder="Where should the ride bring you back to?"
                  />
                </FormField>
              </div>
            ) : null}
            <FormError message={topError} />
            <Button type="submit" disabled={send.isPending} className="w-full sm:w-auto">
              {send.isPending ? 'Sending…' : 'Send request'}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
