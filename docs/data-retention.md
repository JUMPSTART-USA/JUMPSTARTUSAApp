# Data retention

The platform holds conviction records, drug-test results, case notes, housing
and employment history, and photographs, for people leaving prison. "Keep
everything forever" is not a policy — it is the absence of one, and it is the
state the platform is in today: nothing expires, nothing is purged, and every
table grows without bound.

This document is the proposed policy. **Nothing here is implemented.** It is
written down first because the numbers are a decision for JUMPSTART USA and its
counsel, not for whoever writes the deletion job.

## Why it matters

Data you no longer hold cannot be breached, subpoenaed, or mistakenly disclosed.
For a re-entry ministry the calculus is sharper than usual: a participant's
conviction history following them around a database for a decade after they
stopped being a participant is precisely the thing the organisation exists to
help them move past.

Against that, several categories genuinely need long retention — grant
reporting, safeguarding, and the ordinary business of proving what happened.

## Proposed periods

| Data | Proposed | Reasoning |
| --- | --- | --- |
| Audit log | 7 years | The record of who did what. Long retention is the point; it is also the table most likely to be subpoenaed. |
| Client error reports | 90 days | Debugging data. Useless after a few releases and already fingerprint-collapsed. |
| Soft-deleted records (`deletedAt`) | 2 years, then hard delete | Today a soft delete is permanent storage with a flag on it. |
| Session rows | Already bounded | 12-hour absolute lifetime; `connect-pg-simple` prunes expired rows. |
| Password reset / invitation tokens | 30 days after `usedAt` or `expiresAt` | Spent tokens are dead weight; the hash is not sensitive but the row still says who was invited when. |
| Portal link tokens | 1 year after `revokedAt` | Same. |
| Participant records, after exit | **Needs a decision** | The hard one. See below. |
| Attachments and photos | Follows the parent record | They are the most sensitive bytes in the system. |

## The one that needs a real decision

**How long after someone stops being a participant should their record be
kept?** This is a policy question with legal and funder constraints, and the
answer is not obvious:

- Grant agreements may require outcome reporting for a fixed number of years.
- Some funders require the ability to re-verify historical numbers.
- Alumni engagement is an active part of the programme, so "exited" is not
  "finished".
- Against all of that: this is the most sensitive personal data in the system,
  about a population for whom disclosure carries real consequences.

A reasonable shape is **anonymise rather than delete** — retain the aggregate
facts that reporting needs (counts, dates, programme outcomes) and drop the
identifying ones (name, date of birth, addresses, photographs, case notes,
conviction detail) once the retention period elapses. That keeps the numbers
and destroys the identification.

## Before implementing

1. Confirm the periods with counsel and with the funders whose agreements
   specify reporting windows.
2. Decide the anonymise-vs-delete question for participants.
3. Write the purge as a scheduled job that **logs what it deleted to the audit
   log** — a deletion job with no record of its own deletions is unauditable.
4. Run it in report-only mode for at least one full cycle before it deletes
   anything.
5. Confirm the backup retention window (currently 14 days on the flexible
   server) is consistent with the policy: data deleted from the live database
   survives in backups until they roll off.
