-- DataMigration: backfill acknowledgment for donations that predate the native
-- acknowledgment feature (added 2026-08-05 in native_development_and_volunteer_engagement).
-- Historical Bloomerang-era gifts would otherwise all surface as "awaiting
-- acknowledgment", flooding the queue and the dashboard attention item. Stamp
-- them as acknowledged at their creation time; acknowledgedById stays NULL.
-- Rows created on/after the cutoff are left alone so genuinely new gifts still
-- flow through the acknowledgment queue.
UPDATE "donations"
SET "acknowledgedAt" = COALESCE("acknowledgedAt", "createdAt")
WHERE "acknowledgedAt" IS NULL
  AND "createdAt" < TIMESTAMP '2026-08-05 00:00:00';
