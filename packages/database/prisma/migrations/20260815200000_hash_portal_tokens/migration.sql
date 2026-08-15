-- Participant portal links become hashed, single-purpose bearer credentials
-- with an expiry, matching how password-reset tokens have always been stored.
--
-- The existing plaintext tokens are hashed IN PLACE rather than revoked, so
-- every link already in a participant's hands keeps working. pgcrypto's
-- digest() gives the same sha256 hex the API computes, so no backfill script
-- is needed and there is no window where the column is half-populated.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE "participant_portal_tokens" ADD COLUMN "tokenHash" TEXT;
ALTER TABLE "participant_portal_tokens" ADD COLUMN "expiresAt" TIMESTAMP(3);

UPDATE "participant_portal_tokens"
SET "tokenHash" = encode(digest("token", 'sha256'), 'hex'),
    -- Live links get the standard 90 days from now rather than from issue, so
    -- nobody is logged out by the deploy itself. Already-revoked rows get a
    -- past date; they are dead either way and this keeps the column NOT NULL.
    "expiresAt" = CASE
      WHEN "active" THEN NOW() + INTERVAL '90 days'
      ELSE NOW()
    END;

ALTER TABLE "participant_portal_tokens" ALTER COLUMN "tokenHash" SET NOT NULL;
ALTER TABLE "participant_portal_tokens" ALTER COLUMN "expiresAt" SET NOT NULL;

-- The plaintext column goes. Staff can no longer re-copy an existing link;
-- issuing a new one is the supported path, and it already revokes the old.
DROP INDEX IF EXISTS "participant_portal_tokens_token_key";
ALTER TABLE "participant_portal_tokens" DROP COLUMN "token";

CREATE UNIQUE INDEX "participant_portal_tokens_tokenHash_key"
  ON "participant_portal_tokens"("tokenHash");
