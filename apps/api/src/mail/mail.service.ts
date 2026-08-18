import { Injectable, Logger } from '@nestjs/common';
import { loadEnv } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Outbound email via Microsoft Graph (client-credentials): the org already
 * runs Microsoft 365, so invites come from a real jumpstartusa.org mailbox —
 * no third-party mail vendor.
 *
 * Server credentials: GRAPH_TENANT_ID / GRAPH_CLIENT_ID / GRAPH_CLIENT_SECRET
 * (an Entra app with the Mail.Send application permission, admin-consented).
 * The From account is admin-assignable at runtime via the app setting
 * `email.fromAddress` (Admin → Settings), falling back to EMAIL_FROM.
 *
 * Unconfigured is not an error: senders report { sent: false } and callers
 * fall back to the original manual hand-off flow.
 */
export const EMAIL_FROM_SETTING_KEY = 'email.fromAddress';

const GRAPH_SCOPE = 'https://graph.microsoft.com/.default';

/**
 * How the send path looks from the outside. Deliberately coarse — /api/health
 * is public, and the underlying AADSTS codes describe the tenant's identity
 * configuration. The detail goes to the log, which is where an operator can
 * see it and an anonymous caller cannot.
 */
export type SendPathStatus = 'ok' | 'failing' | 'unconfigured' | 'unknown';

export interface MailHealth {
  configured: boolean;
  sendPath: SendPathStatus;
  checkedAt: string | null;
}

/**
 * Re-probe at most this often. The App Service health probe hits /api/health
 * about once a minute; without a floor, a BROKEN credential would mean a
 * failed token request to Entra every single time, which is both noise and a
 * good way to get throttled.
 */
const PROBE_INTERVAL_MS = 5 * 60 * 1000;

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private token: { value: string; expiresAt: number } | null = null;
  private sendPath: SendPathStatus = 'unknown';
  private lastProbeAt: number | null = null;
  private probing: Promise<void> | null = null;

  constructor(private readonly prisma: PrismaService) {}

  configured(): boolean {
    const env = loadEnv();
    return Boolean(env.GRAPH_TENANT_ID && env.GRAPH_CLIENT_ID && env.GRAPH_CLIENT_SECRET);
  }

  /**
   * What /api/health reports. Returns the LAST KNOWN result and never waits on
   * the network.
   *
   * That matters more than it looks: healthCheckPath decides whether App
   * Service keeps an instance in rotation, so a health endpoint that blocks on
   * a call to Entra would turn an Entra slowdown into an outage of this app.
   * The probe is kicked off in the background when the cached answer is stale.
   */
  health(): MailHealth {
    if (!this.configured()) {
      return { configured: false, sendPath: 'unconfigured', checkedAt: null };
    }
    const stale = this.lastProbeAt === null || Date.now() - this.lastProbeAt > PROBE_INTERVAL_MS;
    if (stale) void this.probeSendPath();
    return {
      configured: true,
      sendPath: this.sendPath,
      checkedAt: this.lastProbeAt ? new Date(this.lastProbeAt).toISOString() : null,
    };
  }

  /**
   * Actually exercise the send path, as far as can be done without sending
   * anything: acquire a client-credentials token from Entra.
   *
   * This is the check that was missing. `configured()` only asks whether three
   * environment variables are non-empty, and it answered "configured"
   * throughout an outage in which every send failed with a 401 — the stored
   * client secret was a secret ID rather than a secret value. Presence is not
   * function, and health should report the difference.
   *
   * It stops at the token deliberately. Going further would mean sending mail
   * on a timer, and a health check with a side effect that lands in somebody's
   * inbox is a health check people switch off. A valid token proves tenant,
   * client id and secret; Mail.Send consent and the sender mailbox are checked
   * by the first real send, which now logs loudly when it fails.
   */
  async probeSendPath(): Promise<SendPathStatus> {
    if (!this.configured()) {
      this.sendPath = 'unconfigured';
      this.lastProbeAt = Date.now();
      return this.sendPath;
    }
    // Collapse concurrent probes — several health hits must not each call out.
    this.probing ??= (async () => {
      try {
        await this.accessToken();
        if (this.sendPath !== 'ok') this.logger.log('Graph send path OK (token acquired).');
        this.sendPath = 'ok';
      } catch (err) {
        this.sendPath = 'failing';
        // The detail lives HERE, not in the public health response.
        this.logger.error(
          'MAIL SEND PATH FAILING — every security notification is being dropped: ' +
            (err instanceof Error ? err.message : String(err)),
        );
      } finally {
        this.lastProbeAt = Date.now();
        this.probing = null;
      }
    })();
    await this.probing;
    return this.sendPath;
  }

  /** Admin-assigned From account, falling back to the EMAIL_FROM env default. */
  async fromAddress(): Promise<string> {
    const row = await this.prisma.appSetting.findUnique({
      where: { key: EMAIL_FROM_SETTING_KEY },
    });
    const value = row?.value;
    if (typeof value === 'string' && value.includes('@')) return value;
    if (
      value &&
      typeof value === 'object' &&
      'address' in value &&
      typeof (value as { address: unknown }).address === 'string'
    ) {
      return (value as { address: string }).address;
    }
    return loadEnv().EMAIL_FROM;
  }

  /** Send; returns whether an email actually went out. Never throws. */
  async send(to: string, subject: string, html: string): Promise<{ sent: boolean; from: string }> {
    const from = await this.fromAddress();
    if (!this.configured()) {
      this.logger.warn(`email not configured — skipped "${subject}" to ${to}`);
      return { sent: false, from };
    }
    try {
      const token = await this.accessToken();
      const res = await fetch(
        `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(from)}/sendMail`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: {
              subject,
              body: { contentType: 'HTML', content: html },
              toRecipients: [{ emailAddress: { address: to } }],
            },
            saveToSentItems: true,
          }),
        },
      );
      if (res.status !== 202) {
        const body = await res.text();
        this.logger.error(`Graph sendMail failed (${res.status}): ${body.slice(0, 300)}`);
        // A real send is better evidence than any probe — record what it found.
        this.sendPath = 'failing';
        this.lastProbeAt = Date.now();
        return { sent: false, from };
      }
      this.sendPath = 'ok';
      this.lastProbeAt = Date.now();
      return { sent: true, from };
    } catch (err) {
      this.logger.error('Graph sendMail error', err instanceof Error ? err.stack : String(err));
      this.sendPath = 'failing';
      this.lastProbeAt = Date.now();
      return { sent: false, from };
    }
  }

  async sendPasswordReset(
    to: string,
    firstName: string,
    resetUrl: string,
  ): Promise<{ sent: boolean; from: string }> {
    const subject = 'Reset your JUMPSTART USA Operations Platform password';
    const html = `
      <p>Hi ${escapeHtml(firstName)},</p>
      <p>A password reset was requested for your account. If that was you, choose a new
      password here within the next hour:</p>
      <p><a href="${resetUrl}">Reset my password</a></p>
      <p>If you did not request this, you can ignore this email — your password is unchanged.</p>
      <p>— JUMPSTART USA</p>`;
    return this.send(to, subject, html);
  }

  /**
   * Sent when repeated failures lock an account.
   *
   * The point is not the lockout — it is telling the person that somebody has
   * been trying. The sign-in screen deliberately will not say "this account is
   * locked" to a caller who did not supply the password, since that would
   * confirm the address exists; this email is how the real owner finds out.
   */
  async sendAccountLocked(
    to: string,
    firstName: string,
    lockedUntil: Date,
  ): Promise<{ sent: boolean; from: string }> {
    const origin = loadEnv().WEB_ORIGIN;
    const subject = 'Your JUMPSTART USA account was temporarily locked';
    const until = lockedUntil.toLocaleString('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'America/New_York',
    });
    const html = `
      <p>Hi ${escapeHtml(firstName)},</p>
      <p>There have been several failed sign-in attempts on your account, so we
      have locked it until <strong>${escapeHtml(until)}</strong> (Eastern).</p>
      <p><strong>If that was you</strong> — wait until then and try again, or
      <a href="${origin}/forgot-password">reset your password</a> now.</p>
      <p><strong>If it was not you</strong>, someone is guessing your password.
      Reset it, and tell an administrator so they can check the account.</p>
      <p>— JUMPSTART USA</p>`;
    return this.send(to, subject, html);
  }

  /**
   * Sent to the PREVIOUS address when an administrator changes someone's
   * email. That old mailbox is the one an attacker performing this takeover
   * does not control, which is the entire point of sending it there.
   */
  async sendEmailChanged(
    previousAddress: string,
    firstName: string,
    newAddress: string,
  ): Promise<{ sent: boolean; from: string }> {
    const subject = 'The email address on your JUMPSTART USA account was changed';
    const html = `
      <p>Hi ${escapeHtml(firstName)},</p>
      <p>An administrator changed the email address on your JUMPSTART USA
      Operations Platform account to <strong>${escapeHtml(newAddress)}</strong>.
      Sign-in and password resets now go to that address.</p>
      <p>If you did not expect this, contact an administrator immediately — a
      changed address can be used to take over an account.</p>
      <p>— JUMPSTART USA</p>`;
    return this.send(previousAddress, subject, html);
  }

  /** Sent when an administrator changes which roles an account holds. */
  async sendRolesChanged(
    to: string,
    firstName: string,
    roles: string[],
  ): Promise<{ sent: boolean; from: string }> {
    const subject = 'Your JUMPSTART USA access was changed';
    const list = roles.length ? roles.join(', ') : 'none';
    const html = `
      <p>Hi ${escapeHtml(firstName)},</p>
      <p>An administrator changed what your account can do. You now hold:
      <strong>${escapeHtml(list)}</strong>.</p>
      <p>If that is not what you expected, contact an administrator.</p>
      <p>— JUMPSTART USA</p>`;
    return this.send(to, subject, html);
  }

  /**
   * Sent when an administrator clears an account's second factor. Usually the
   * legitimate lost-authenticator rescue; the one time it is not, the account
   * holder is the only person who can tell.
   */
  async sendSecondFactorReset(
    to: string,
    firstName: string,
  ): Promise<{ sent: boolean; from: string }> {
    const origin = loadEnv().WEB_ORIGIN;
    const subject = 'Two-factor authentication was reset on your JUMPSTART USA account';
    const html = `
      <p>Hi ${escapeHtml(firstName)},</p>
      <p>An administrator reset the two-factor authentication on your account.
      Any authenticator app or passkey you had set up no longer works, and you
      have been signed out everywhere.</p>
      <p>Sign in at <a href="${origin}/login">${origin}</a> with your password
      and set two-factor up again from your account page.</p>
      <p>If you did not ask for this, contact an administrator immediately.</p>
      <p>— JUMPSTART USA</p>`;
    return this.send(to, subject, html);
  }

  /**
   * An administrator removed the account's passkeys.
   *
   * Says what still works, because the whole point of this action (as opposed
   * to a full second-factor reset) is that the authenticator app was never
   * the problem.
   */
  async sendPasskeysRemoved(
    to: string,
    firstName: string,
    removed: number,
  ): Promise<{ sent: boolean; from: string }> {
    const origin = loadEnv().WEB_ORIGIN;
    const subject = 'Passkeys were removed from your JUMPSTART USA account';
    const plural = removed === 1 ? 'passkey was' : `${removed} passkeys were`;
    const html = `
      <p>Hi ${escapeHtml(firstName)},</p>
      <p>An administrator removed ${plural} removed from your account, and you
      have been signed out everywhere. Any authenticator app and recovery codes
      you had set up still work.</p>
      <p>Sign in at <a href="${origin}/login">${origin}</a> and add a passkey
      again from your account page whenever you are ready.</p>
      <p>If you did not ask for this, contact an administrator immediately.</p>
      <p>— JUMPSTART USA</p>`;
    return this.send(to, subject, html);
  }

  /**
   * Sign-in suspended by an administrator.
   *
   * Deliberately does not speculate about why. The person who suspended the
   * account knows the reason and can give it; an email guessing at it would
   * be wrong as often as right, and this one may be read by someone who is
   * simply on leave.
   */
  async sendSignInSuspended(
    to: string,
    firstName: string,
  ): Promise<{ sent: boolean; from: string }> {
    const subject = 'Sign-in to your JUMPSTART USA account is suspended';
    const html = `
      <p>Hi ${escapeHtml(firstName)},</p>
      <p>An administrator has suspended sign-in to your account, and you have
      been signed out everywhere. Your account and your work are unchanged —
      nothing has been deleted or reassigned.</p>
      <p>Contact an administrator when you need access restored.</p>
      <p>— JUMPSTART USA</p>`;
    return this.send(to, subject, html);
  }

  /** Sign-in restored after a suspension. */
  async sendSignInRestored(
    to: string,
    firstName: string,
  ): Promise<{ sent: boolean; from: string }> {
    const origin = loadEnv().WEB_ORIGIN;
    const subject = 'Sign-in to your JUMPSTART USA account is restored';
    const html = `
      <p>Hi ${escapeHtml(firstName)},</p>
      <p>An administrator has restored sign-in to your account. Everything is
      as you left it.</p>
      <p>Sign in at <a href="${origin}/login">${origin}</a>.</p>
      <p>— JUMPSTART USA</p>`;
    return this.send(to, subject, html);
  }

  /**
   * Invitation. Carries a LINK, not a password.
   *
   * It used to email a working temporary password, which then lived in the
   * recipient's mailbox, the sending mailbox's Sent Items, and every backup of
   * either — indefinitely, with no expiry. The link is single-use, hashed at
   * rest, and dead after seven days.
   *
   * inviteUrl is built by the caller from WEB_ORIGIN and is not escaped into
   * the href: it is server-constructed from a hex token, never user input.
   */
  async sendInvite(
    to: string,
    firstName: string,
    inviteUrl: string,
  ): Promise<{ sent: boolean; from: string }> {
    const subject = 'You are invited to the JUMPSTART USA Operations Platform';
    const html = `
      <p>Hi ${escapeHtml(firstName)},</p>
      <p>An account has been created for you on the JUMPSTART USA Operations
      Platform, for <strong>${escapeHtml(to)}</strong>.</p>
      <p>Choose your password here — the link works once and expires in seven
      days:</p>
      <p><a href="${inviteUrl}">Set my password</a></p>
      <p>After that you will enroll two-factor authentication, so have an
      authenticator app ready.</p>
      <p>If you were not expecting this, you can ignore this email.</p>
      <p>— JUMPSTART USA</p>`;
    return this.send(to, subject, html);
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 60_000) return this.token.value;
    const env = loadEnv();
    const res = await fetch(
      `https://login.microsoftonline.com/${env.GRAPH_TENANT_ID}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: env.GRAPH_CLIENT_ID ?? '',
          client_secret: env.GRAPH_CLIENT_SECRET ?? '',
          scope: GRAPH_SCOPE,
          grant_type: 'client_credentials',
        }),
      },
    );
    if (!res.ok) throw new Error(`Graph token request failed (${res.status})`);
    const data = (await res.json()) as { access_token: string; expires_in: number };
    this.token = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
    return this.token.value;
  }
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
