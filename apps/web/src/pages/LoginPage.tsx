import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CHAPTER_STATES, usChapterMap } from '@/assets/brand/chapters';
import logoColor from '@/assets/brand/jumpstart-logo.png';
import logoTaglineWhite from '@/assets/brand/jumpstart-usa-tagline-white.png';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import { FormError, Notice } from '@/components/ui/notice';
import { api, ApiError } from '@/lib/api';
import { signedOutReason } from '@/lib/session-return';
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
  /**
   * Say why they are looking at a login screen. An expired session used to bounce
   * the user here with no explanation, which reads as "the app signed me out" or
   * even "my account is gone" rather than "your session timed out".
   */
  const expired = signedOutReason() === 'expired';

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
      // No navigate() here: App's /login redirect fires as soon as `user` lands
      // and sends the user to the interrupted path. Racing it only lost.
      navigate('/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Sign-in failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen">
      {/*
        Brand panel — palette and chapter map from jumpstartvision.org.

        `hidden lg:flex`, so below 1024px this whole panel is display:none — but
        a plain <img> inside it is still fetched and decoded. Measured on a
        375px viewport: the map arrived complete at its full width for a slot
        rendered 0px wide, on the connection least able to afford it.

        `loading="lazy"` is what stops that: a lazy image that is not in the
        viewport is not fetched, and display:none is never in the viewport. On a
        large screen the panel IS visible at load, so both images are in the
        initial viewport and load immediately — the attribute costs nothing
        there.
      */}
      <div className="hidden flex-col justify-between bg-gradient-to-br from-navy-deep to-navy p-10 lg:flex lg:w-[46%]">
        <img src={logoTaglineWhite} alt="JUMPSTART USA — Transforming the lives of prisoners from the inside out" className="w-72 self-start" loading="lazy" />
        <img src={usChapterMap} alt="Map of JUMPSTART chapter states" className="mx-auto w-full max-w-md drop-shadow-lg" loading="lazy" />
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
                    {/* Not tabIndex={-1}: this is the only link to password
                        recovery in the app, and removing it from the tab order
                        left a locked-out keyboard user with no way to reach it. */}
                    <Link to="/forgot-password" className="text-xs text-primary hover:underline">
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
            {expired && !error ? (
              <Notice variant="info">
                Your session timed out. Sign in and we will take you back to where you were.
              </Notice>
            ) : null}
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
