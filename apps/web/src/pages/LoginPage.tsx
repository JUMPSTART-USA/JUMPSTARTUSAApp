import { browserSupportsWebAuthn, startAuthentication } from '@simplewebauthn/browser';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CHAPTER_BRAND, usChapterMap } from '@/assets/brand/chapters';
import logoColor from '@/assets/brand/jumpstart-logo.png';
import logoTaglineWhite from '@/assets/brand/jumpstart-usa-tagline-white.png';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import { FormError, Notice } from '@/components/ui/notice';
import { api, ApiError } from '@/lib/api';
import { signedOutReason } from '@/lib/session-return';
import { useAuth } from '@/lib/auth';

/** The second-factor step's entry mode. Passkey leads when one is registered. */
type SecondFactorMode = 'passkey' | 'totp' | 'recovery';

interface LoginStepResponse {
  totpRequired?: boolean;
  /** Whether a 6-digit code is even possible (passkey-only accounts: no). */
  totpEnabled?: boolean;
  /** WebAuthn request options when the account has passkeys; null otherwise. */
  passkeyOptions?: Parameters<typeof startAuthentication>[0]['optionsJSON'] | null;
  user?: unknown;
}

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [totpRequired, setTotpRequired] = useState(false);
  const [totpEnabled, setTotpEnabled] = useState(true);
  const [passkeyOptions, setPasskeyOptions] = useState<LoginStepResponse['passkeyOptions']>(null);
  const [mode, setMode] = useState<SecondFactorMode>('totp');
  const [recoveryCode, setRecoveryCode] = useState('');
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

  const finishLogin = async () => {
    await refresh();
    // No navigate() here: App's /login redirect fires as soon as `user` lands
    // and sends the user to the interrupted path. Racing it only lost.
    navigate('/');
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await api.post<LoginStepResponse>('/auth/login', {
        email,
        password,
        totpCode: totpRequired && mode === 'totp' && totpCode ? totpCode : undefined,
        recoveryCode: totpRequired && mode === 'recovery' && recoveryCode ? recoveryCode : undefined,
      });
      if (result.totpRequired) {
        setTotpRequired(true);
        setTotpEnabled(result.totpEnabled ?? true);
        setPasskeyOptions(result.passkeyOptions ?? null);
        // Only lead with the passkey when this browser can actually run the
        // ceremony; otherwise the button would be a dead end.
        setMode(result.passkeyOptions && browserSupportsWebAuthn() ? 'passkey' : 'totp');
        return;
      }
      await finishLogin();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Sign-in failed');
    } finally {
      setBusy(false);
    }
  };

  /** The passkey ceremony: browser prompt (Face ID / Touch ID) → assertion → login. */
  const signInWithPasskey = async () => {
    if (!passkeyOptions) return;
    setBusy(true);
    setError(null);
    try {
      const assertion = await startAuthentication({ optionsJSON: passkeyOptions });
      const result = await api.post<LoginStepResponse>('/auth/login', {
        email,
        password,
        passkeyResponse: assertion,
      });
      if (result.totpRequired) {
        // Server round-trip landed back on the second-factor step (stale
        // challenge, e.g. after idling here) — fresh options arrive with it.
        setPasskeyOptions(result.passkeyOptions ?? null);
        setError('Passkey sign-in did not complete — try again.');
        return;
      }
      await finishLogin();
    } catch (err) {
      // NotAllowedError = the user dismissed the browser prompt; not a failure
      // worth alarming copy.
      if (err instanceof Error && err.name === 'NotAllowedError') return;
      setError(err instanceof ApiError ? err.message : 'Passkey sign-in failed');
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
            {CHAPTER_BRAND.map((s, i) => (
              <span key={s.code}>
                {s.name}
                {i < CHAPTER_BRAND.length - 1 && <span className="ml-2 text-gold">·</span>}
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
            ) : mode === 'passkey' ? (
              <div className="space-y-3">
                <Button
                  type="button"
                  size="lg"
                  className="w-full"
                  disabled={busy}
                  onClick={() => void signInWithPasskey()}
                >
                  {busy ? 'Waiting for your passkey…' : 'Sign in with your passkey'}
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  Your browser will ask for Face ID, Touch ID, or your security key.
                </p>
                {totpEnabled ? (
                  <button
                    type="button"
                    className="text-xs text-primary hover:underline"
                    onClick={() => {
                      setMode('totp');
                      setError(null);
                    }}
                  >
                    Use an authenticator code instead
                  </button>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Lost your passkey? An administrator can reset your sign-in.
                  </p>
                )}
              </div>
            ) : mode === 'totp' ? (
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
                <div className="flex flex-col items-start gap-1">
                  {passkeyOptions ? (
                    <button
                      type="button"
                      className="text-xs text-primary hover:underline"
                      onClick={() => {
                        setMode('passkey');
                        setError(null);
                      }}
                    >
                      Use your passkey instead
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="text-xs text-primary hover:underline"
                    onClick={() => {
                      setMode('recovery');
                      setError(null);
                    }}
                  >
                    Lost your authenticator? Use a recovery code
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="recovery">Recovery code</Label>
                <Input
                  id="recovery"
                  autoComplete="off"
                  maxLength={20}
                  placeholder="XXXXX-XXXXX"
                  value={recoveryCode}
                  onChange={(e) => setRecoveryCode(e.target.value)}
                  autoFocus
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Each recovery code works once. After signing in, generate a fresh set under My
                  account.
                </p>
                <button
                  type="button"
                  className="text-xs text-primary hover:underline"
                  onClick={() => {
                    setMode('totp');
                    setError(null);
                  }}
                >
                  Back to authenticator code
                </button>
              </div>
            )}
            {expired && !error ? (
              <Notice variant="info">
                Your session timed out. Sign in and we will take you back to where you were.
              </Notice>
            ) : null}
            <FormError message={error} />
            {/* The passkey mode has its own button — a submit would send an
                empty code and burn a throttle slot. */}
            {!(totpRequired && mode === 'passkey') ? (
              <Button type="submit" variant="accent" size="lg" className="w-full" disabled={busy}>
                {busy ? 'Signing in…' : totpRequired ? 'Verify' : 'Sign in'}
              </Button>
            ) : null}
          </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
