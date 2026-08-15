-- Where an audited action came from.
--
-- The schema already commented that audit metadata held "export filters, IP,
-- user agent, etc." — the AuditEntry interface had no such fields and no call
-- site supplied them. Without a source, a compromised-account investigation
-- cannot separate the attacker's actions from the user's own.
ALTER TABLE "audit_logs" ADD COLUMN "ipAddress" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN "userAgent" TEXT;
