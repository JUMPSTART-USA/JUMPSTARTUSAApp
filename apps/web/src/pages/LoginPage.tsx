import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CHAPTER_STATES, usChapterMap } from '@/assets/brand/chapters';
import logoColor from '@/assets/brand/jumpstart-logo.png';
import logoTaglineWhite from '@/assets/brand/jumpstart-usa-tagline-white.png';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import { FormError } from '@/components/ui/notice';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [totpRequired, setTotpRequired] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { refresh } = useAuth();
  const navigate = useNavigate();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await api.post<{ totpRequired?: boolean; user?: unknown }>('/auth/login', {
        email,
        password,
        totpCode: totpCode || undefined,
      });
      if (result.totpRequired) {
        setTotpRequired(true);
        return;
      }
      await refresh();
      navigate('/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Sign-in failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen">
      {/* Brand panel — palette and chapter map from jumpstartvision.org */}
      <div className="hidden flex-col justify-between bg-gradient-to-br from-navy-deep to-navy p-10 lg:flex lg:w-[46%]">
        <img src={logoTaglineWhite} alt="JUMPSTART USA — Transforming the lives of prisoners from the inside out" className="w-72 self-start" />
        <img src={usChapterMap} alt="Map of JUMPSTART chapter states" className="mx-auto w-full max-w-md drop-shadow-lg" />
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-widest text-gold">
            Serving six state chapters
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-2 gap-y-1 text-sm text-white/80">
            {CHAPTER_STATES.map((s, i) => (
              <span key={s.code}>
                {s.name}
                {i < CHAPTER_STATES.length - 1 && <span className="ml-2 text-gold">·</span>}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center bg-background p-4">
        <Card className="w-full max-w-sm">
          <CardHeader className="items-center text-center">
            <img src={logoColor} alt="JUMPSTART" className="mb-1 w-56" />
            <p className="text-sm text-muted-foreground">Operations Platform</p>
          </CardHeader>
          <CardContent>
          <form onSubmit={submit} className="space-y-4">
            {!totpRequired ? (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="username"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Password</Label>
                    <Link
                      to="/forgot-password"
                      className="text-xs text-primary hover:underline"
                      tabIndex={-1}
                    >
                      Forgot password?
                    </Link>
                  </div>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
              </>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="totp">Authentication code</Label>
                <Input
                  id="totp"
                  inputMode="numeric"
                  pattern="\d{6}"
                  maxLength={6}
                  placeholder="6-digit code"
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value)}
                  autoFocus
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Enter the code from your authenticator app.
                </p>
              </div>
            )}
            <FormError message={error} />
            <Button type="submit" variant="accent" size="lg" className="w-full" disabled={busy}>
              {busy ? 'Signing in…' : totpRequired ? 'Verify' : 'Sign in'}
            </Button>
          </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
