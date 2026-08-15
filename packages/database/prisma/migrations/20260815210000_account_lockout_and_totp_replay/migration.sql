-- Per-account brute-force state and TOTP replay protection.
--
-- The throttler is per-IP, so guessing spread across addresses was unbounded
-- against one known email. And a TOTP code stayed valid for the rest of its
-- 30-second window after being used, so an observed code could be replayed.
ALTER TABLE "users" ADD COLUMN "lastTotpStep" INTEGER;
ALTER TABLE "users" ADD COLUMN "failedLoginCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN "lockedUntil" TIMESTAMP(3);
