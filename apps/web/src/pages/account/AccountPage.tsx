import { changePasswordSchema, type ChangePasswordInput } from '@jumpstart/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { KeyRound, ShieldCheck } from 'lucide-react';
import QRCode from 'qrcode';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { FormField } from '@/components/FormField';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeaderRow } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { FormError, Notice } from '@/components/ui/notice';
import { PageHeader } from '@/components/ui/page-header';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { applyApiError, formResolver } from '@/lib/form';

/**
 * Two-factor enrollment (§3.2): the API generates the secret server-side
 * (POST /auth/totp/setup) and arms it only after the user proves their
 * authenticator produces matching codes (POST /auth/totp/confirm). The QR is
 * rendered locally from the otpauth URL — the secret never leaves this page
 * except inside the user's authenticator app.
 */
function TwoFactorCard() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [setup, setSetup] = useState<{ secret: string; qrDataUrl: string } | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [justEnabled, setJustEnabled] = useState(false);

  const start = useMutation({
    mutationFn: () => api.post<{ otpauthUrl: string; secret: string }>('/auth/totp/setup'),
    onSuccess: async (res) => {
      setError(null);
      setSetup({ secret: res.secret, qrDataUrl: await QRCode.toDataURL(res.otpauthUrl, { width: 192, margin: 1 }) });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not start setup'),
  });

  const confirm = useMutation({
    mutationFn: () => api.post('/auth/totp/confirm', { code }),
    onSuccess: () => {
      setSetup(null);
      setCode('');
      setError(null);
      setJustEnabled(true);
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not confirm the code'),
  });

  return (
    <Card>
      <CardHeaderRow
        title="Two-factor authentication"
        description="A 6-digit code from an authenticator app, required at every sign-in."
      />
      <CardContent className="space-y-4">
        {user?.totpEnabled || justEnabled ? (
          <Notice variant="success" title="Two-factor authentication is on">
            Sign-ins to this account require a code from your authenticator app. If you lose the
            device, an administrator must reset your account.
          </Notice>
        ) : setup ? (
          <div className="space-y-4">
            <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
              <li>Scan the QR code with your authenticator app (or enter the key manually).</li>
              <li>Enter the 6-digit code the app shows to finish.</li>
            </ol>
            <div className="flex flex-wrap items-start gap-4">
              <img
                src={setup.qrDataUrl}
                alt="QR code for your authenticator app"
                className="h-48 w-48 rounded-md border"
              />
              <div className="min-w-0 space-y-3">
                <FormField label="Manual entry key" hint="For apps that can't scan the code.">
                  <p className="break-all rounded-md border bg-muted/40 px-3 py-2 font-mono text-sm">
                    {setup.secret}
                  </p>
                </FormField>
                <FormField label="6-digit code">
                  <Input
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    className="w-32 text-center font-mono"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  />
                </FormField>
                <div className="flex gap-2">
                  <Button
                    onClick={() => confirm.mutate()}
                    disabled={code.length !== 6 || confirm.isPending}
                  >
                    <ShieldCheck className="h-4 w-4" />
                    {confirm.isPending ? 'Confirming…' : 'Turn on two-factor'}
                  </Button>
                  <Button variant="outline" onClick={() => { setSetup(null); setCode(''); setError(null); }}>
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Protect this account with a second factor. You&apos;ll need an authenticator app
              (e.g. the iPhone&apos;s built-in one, Google Authenticator, or 1Password).
            </p>
            <Button onClick={() => start.mutate()} disabled={start.isPending}>
              <ShieldCheck className="h-4 w-4" />
              {start.isPending ? 'Preparing…' : 'Set up two-factor authentication'}
            </Button>
          </div>
        )}
        <FormError message={error} />
      </CardContent>
    </Card>
  );
}

function ChangePasswordCard() {
  const [topError, setTopError] = useState<string | null>(null);
  const form = useForm<ChangePasswordInput>({
    resolver: formResolver(changePasswordSchema),
    defaultValues: { currentPassword: '', password: '', confirmPassword: '' },
  });
  const { register, formState: { errors } } = form;

  const change = useMutation({
    mutationFn: (body: ChangePasswordInput) => api.post('/auth/change-password', body),
    onSuccess: () => {
      // The API destroys the session on success — land on the login screen
      // cleanly instead of letting the next request bounce there with a 401.
      window.location.assign('/login');
    },
    onError: (err) => setTopError(applyApiError(err, form.setError)),
  });

  return (
    <Card>
      <CardHeaderRow
        title="Change password"
        description="Changing your password signs you out everywhere; sign back in with the new one."
      />
      <CardContent>
        <form
          className="max-w-sm space-y-4"
          onSubmit={form.handleSubmit((values) => {
            setTopError(null);
            change.mutate(values);
          })}
        >
          <FormField label="Current password" required error={errors.currentPassword}>
            <Input type="password" autoComplete="current-password" {...register('currentPassword')} />
          </FormField>
          <FormField label="New password" required error={errors.password}>
            <Input type="password" autoComplete="new-password" {...register('password')} />
          </FormField>
          <FormField label="Confirm new password" required error={errors.confirmPassword}>
            <Input type="password" autoComplete="new-password" {...register('confirmPassword')} />
          </FormField>
          <FormError message={topError} />
          <Button type="submit" disabled={change.isPending}>
            <KeyRound className="h-4 w-4" />
            {change.isPending ? 'Saving…' : 'Change password'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export function AccountPage() {
  return (
    <div className="space-y-4">
      <PageHeader title="My account" />
      <TwoFactorCard />
      <ChangePasswordCard />
    </div>
  );
}
