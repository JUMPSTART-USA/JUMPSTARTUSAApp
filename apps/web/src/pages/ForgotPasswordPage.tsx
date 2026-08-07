import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import logoColor from '@/assets/brand/jumpstart-logo.png';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import { FormError } from '@/components/ui/notice';
import { api, ApiError } from '@/lib/api';

/**
 * Self-service reset, step 1 (§3.1). The API always answers ok — the
 * confirmation copy is the same whether or not the email is registered.
 */
export function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post('/auth/forgot-password', { email });
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong — try again');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <img src={logoColor} alt="JUMPSTART" className="mb-1 w-56" />
          <p className="text-sm text-muted-foreground">Reset your password</p>
        </CardHeader>
        <CardContent>
          {submitted ? (
            <div className="space-y-4 text-sm">
              <p>
                If an account exists for <span className="font-medium">{email}</span>, a reset
                link is on its way — check your inbox. The link works for one hour.
              </p>
              <p className="text-muted-foreground">
                No email after a few minutes? Check spam, or ask an administrator to resend your
                invite.
              </p>
              <Button variant="outline" className="w-full" onClick={() => navigate('/login')}>
                Back to sign in
              </Button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoFocus
                  required
                />
              </div>
              <FormError message={error} />
              <Button type="submit" variant="accent" size="lg" className="w-full" disabled={busy}>
                {busy ? 'Sending…' : 'Send reset link'}
              </Button>
              <p className="text-center text-sm">
                <Link to="/login" className="text-primary hover:underline">
                  Back to sign in
                </Link>
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
