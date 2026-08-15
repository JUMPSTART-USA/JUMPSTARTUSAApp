# Security incident runbook

For: "an account may be compromised", "someone has a credential they should
not", "a laptop with a signed-in session was stolen".

Written to be followed by whoever is on hand, not only by whoever built the
platform. Every command assumes the repository checked out and `az` logged in.

**Rehearse this once before you need it.** A runbook nobody has ever run is a
document, not a plan.

---

## 1. Contain

**Lock the account.** An administrator, in Admin → Users:

- **Deactivate** — ends every live session immediately and hands the caseload
  to a named colleague. The right move when the account belongs to someone who
  has left, or when you are not yet sure what happened.
- **Reset two-factor** — clears their authenticator and passkeys, and ends
  their sessions. The right move when the second factor itself may be
  compromised.

Both are audited and both notify the account holder by email.

**If you cannot sign in as an administrator**, revoke sessions directly:

```sql
DELETE FROM "session" WHERE sess->>'userId' = '<user-id>';
```

**To sign out everyone, everywhere**, rotate the session secret and restart:

```bash
az keyvault secret set --vault-name <vault> --name session-secret --value "$(openssl rand -hex 32)"
az webapp restart --name js-prod-api --resource-group rg-jumpstart-prod
```

This is safe and reversible in the sense that matters: it inconveniences
everyone for one sign-in and ends every session an attacker holds. Do not
hesitate over it.

## 2. Find out what happened

The audit log is the record. It carries the actor, the action, the entity, and
— since phase 3 — the **source IP and user agent**, which is what separates the
attacker's actions from the user's own.

In Admin → Audit log, filter by user and date. For anything larger, query
directly:

```sql
-- Everything an account did, most recent first
SELECT "createdAt", action, "entityType", "entityId", "ipAddress", "userAgent"
FROM audit_logs WHERE "userId" = '<user-id>' ORDER BY "createdAt" DESC LIMIT 500;

-- Sign-ins from an address the user does not normally use
SELECT "ipAddress", COUNT(*), MIN("createdAt"), MAX("createdAt")
FROM audit_logs WHERE "userId" = '<user-id>' AND action = 'login'
GROUP BY "ipAddress" ORDER BY 2 DESC;

-- Failed sign-ins across all accounts — a guessing campaign
SELECT "ipAddress", COUNT(*), COUNT(DISTINCT "userId")
FROM audit_logs WHERE action = 'login_failed' AND "createdAt" > NOW() - INTERVAL '7 days'
GROUP BY "ipAddress" HAVING COUNT(*) > 20 ORDER BY 2 DESC;
```

Pay particular attention to these actions, which are the ones that matter after
a compromise:

| Action | Why |
| --- | --- |
| `export` | Data left the platform. The row records which report and which filters. |
| `read_confidential` | Confidential case notes and attachments were opened. |
| `permission_change` | Roles or chapter scopes were altered — possibly to widen access. |
| `login_failed` | How they got in, or how hard they tried. |

## 3. Assess exposure

- **What could that account see?** Its roles and chapter scope bound it. A
  chapter-scoped account reaches one chapter's records; an admin reaches
  everything.
- **What left?** Every export is audited with its filters. Match `export` rows
  against the window of compromise.
- **Were credentials reachable?** TOTP secrets are encrypted and bound to their
  user id; portal tokens and password-reset tokens are hashed. Database read
  access alone does not yield a usable second factor.

## 4. Recover

1. Have the user set a **new password** — which now revokes every session for
   the account, so do it after containment, not instead of it.
2. Have them **re-enroll two-factor** from `/account`.
3. If a **participant portal link** may be exposed, issue a new one; issuing
   revokes the previous.
4. If anything with database access may be exposed, rotate in this order:
   `session-secret`, the database credential, `encryption-key`.

**Rotating `encryption-key` makes every stored TOTP secret unreadable** and
forces all enrolled users to re-enroll. Only do it if the key itself may have
been exposed, and tell people first.

## 5. Afterwards

- Write down what happened and when, while it is fresh.
- Consider notification obligations. This is personal data about a vulnerable
  population; state breach-notification law may apply, and funders may have
  their own requirements. **Ask counsel — do not decide this alone.**
- Fix what let it happen, and add a test for it.

---

## Things to know before an incident

- **Sessions**: 30-minute idle, 12-hour absolute. An attacker's session dies
  within 12 hours regardless, but do not wait for that.
- **Lockout**: six failed attempts start a lock (1/5/15/60 minutes, backing
  off). A locked-out user gets an email; the sign-in screen deliberately will
  not confirm the lock to someone who does not know the password.
- **The audit log is append-only in code, and only in code** — until
  `docs/database-roles.md` is applied, the role the API runs as can delete from
  it. Apply that runbook.
- **Notifications need email configured.** If `GET /api/health` reports
  `mail: "unconfigured"`, the lockout and second-factor-reset notices are not
  reaching anyone.
