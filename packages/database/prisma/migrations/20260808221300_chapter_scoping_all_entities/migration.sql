-- Chapter scoping (§7.2) — every operational record belongs to exactly one
-- state chapter (docs/chapter-scoping.md). New chapterState columns are added
-- nullable, backfilled from the best available source, then made required.
-- 'SC' (the founding chapter) is the deterministic fallback when no source
-- column yields a chapter state.

-- ── participant_profiles ────────────────────────────────────────────────────
ALTER TABLE "participant_profiles" ADD COLUMN "chapterState" TEXT;
UPDATE "participant_profiles" pp
SET "chapterState" = CASE
  WHEN p."state" IN ('FL','GA','NC','OH','SC','TX') THEN p."state"
  ELSE 'SC'
END
FROM "persons" p
WHERE pp."personId" = p."id";
UPDATE "participant_profiles" SET "chapterState" = 'SC' WHERE "chapterState" IS NULL;
ALTER TABLE "participant_profiles" ALTER COLUMN "chapterState" SET NOT NULL;

-- ── volunteer_profiles ──────────────────────────────────────────────────────
ALTER TABLE "volunteer_profiles" ADD COLUMN "chapterState" TEXT;
UPDATE "volunteer_profiles" vp
SET "chapterState" = CASE
  WHEN p."state" IN ('FL','GA','NC','OH','SC','TX') THEN p."state"
  ELSE 'SC'
END
FROM "persons" p
WHERE vp."personId" = p."id";
UPDATE "volunteer_profiles" SET "chapterState" = 'SC' WHERE "chapterState" IS NULL;
ALTER TABLE "volunteer_profiles" ALTER COLUMN "chapterState" SET NOT NULL;

-- ── donors: postal state when it is a chapter state, else the linked
-- person's state, else SC ────────────────────────────────────────────────────
ALTER TABLE "donors" ADD COLUMN "chapterState" TEXT;
UPDATE "donors" SET "chapterState" = "state" WHERE "state" IN ('FL','GA','NC','OH','SC','TX');
UPDATE "donors" d
SET "chapterState" = p."state"
FROM "persons" p
WHERE d."chapterState" IS NULL
  AND d."personId" = p."id"
  AND p."state" IN ('FL','GA','NC','OH','SC','TX');
UPDATE "donors" SET "chapterState" = 'SC' WHERE "chapterState" IS NULL;
ALTER TABLE "donors" ALTER COLUMN "chapterState" SET NOT NULL;

-- ── households: from any member donor (donors are backfilled above) ─────────
ALTER TABLE "households" ADD COLUMN "chapterState" TEXT;
UPDATE "households" h
SET "chapterState" = (
  SELECT d."chapterState" FROM "donors" d
  WHERE d."householdId" = h."id" AND d."deletedAt" IS NULL
  ORDER BY d."createdAt" ASC LIMIT 1
);
UPDATE "households" SET "chapterState" = 'SC' WHERE "chapterState" IS NULL;
ALTER TABLE "households" ALTER COLUMN "chapterState" SET NOT NULL;

-- ── employers / vendors: postal state when it is a chapter state ────────────
ALTER TABLE "employers" ADD COLUMN "chapterState" TEXT;
UPDATE "employers" SET "chapterState" =
  CASE WHEN "state" IN ('FL','GA','NC','OH','SC','TX') THEN "state" ELSE 'SC' END;
ALTER TABLE "employers" ALTER COLUMN "chapterState" SET NOT NULL;

ALTER TABLE "vendors" ADD COLUMN "chapterState" TEXT;
UPDATE "vendors" SET "chapterState" =
  CASE WHEN "state" IN ('FL','GA','NC','OH','SC','TX') THEN "state" ELSE 'SC' END;
ALTER TABLE "vendors" ALTER COLUMN "chapterState" SET NOT NULL;

-- ── campaigns / events (event inherits its campaign's chapter) ──────────────
ALTER TABLE "campaigns" ADD COLUMN "chapterState" TEXT;
UPDATE "campaigns" SET "chapterState" = 'SC';
ALTER TABLE "campaigns" ALTER COLUMN "chapterState" SET NOT NULL;

ALTER TABLE "events" ADD COLUMN "chapterState" TEXT;
UPDATE "events" e
SET "chapterState" = c."chapterState"
FROM "campaigns" c
WHERE e."campaignId" = c."id";
UPDATE "events" SET "chapterState" = 'SC' WHERE "chapterState" IS NULL;
ALTER TABLE "events" ALTER COLUMN "chapterState" SET NOT NULL;

-- ── vehicles ────────────────────────────────────────────────────────────────
ALTER TABLE "vehicles" ADD COLUMN "chapterState" TEXT;
UPDATE "vehicles" SET "chapterState" = 'SC';
ALTER TABLE "vehicles" ALTER COLUMN "chapterState" SET NOT NULL;

-- ── communications: batch rows follow the batch's chapter later; backfill
-- from the recipient's profile chapter (profiles backfilled above) ───────────
ALTER TABLE "communication_batches" ADD COLUMN "chapterState" TEXT;
UPDATE "communication_batches" SET "chapterState" = 'SC';
ALTER TABLE "communication_batches" ALTER COLUMN "chapterState" SET NOT NULL;

ALTER TABLE "communications" ADD COLUMN "chapterState" TEXT;
UPDATE "communications" c
SET "chapterState" = pp."chapterState"
FROM "participant_profiles" pp
WHERE c."personId" = pp."personId";
UPDATE "communications" c
SET "chapterState" = vp."chapterState"
FROM "volunteer_profiles" vp
WHERE c."chapterState" IS NULL AND c."personId" = vp."personId";
UPDATE "communications" c
SET "chapterState" = p."state"
FROM "persons" p
WHERE c."chapterState" IS NULL
  AND c."personId" = p."id"
  AND p."state" IN ('FL','GA','NC','OH','SC','TX');
UPDATE "communications" SET "chapterState" = 'SC' WHERE "chapterState" IS NULL;
ALTER TABLE "communications" ALTER COLUMN "chapterState" SET NOT NULL;

-- ── outside_programs.state / volunteer_opportunities.state → required ───────
UPDATE "outside_programs" SET "state" = 'SC' WHERE "state" IS NULL;
ALTER TABLE "outside_programs" ALTER COLUMN "state" SET NOT NULL;

UPDATE "volunteer_opportunities" vo
SET "state" = COALESCE(
  vo."state",
  (SELECT i."state" FROM "institutions" i WHERE i."id" = vo."institutionId"),
  (SELECT op."state" FROM "outside_programs" op WHERE op."id" = vo."outsideProgramId"),
  'SC'
)
WHERE vo."state" IS NULL;
ALTER TABLE "volunteer_opportunities" ALTER COLUMN "state" SET NOT NULL;

-- ── indexes ─────────────────────────────────────────────────────────────────
CREATE INDEX "campaigns_chapterState_idx" ON "campaigns"("chapterState");
CREATE INDEX "communication_batches_chapterState_idx" ON "communication_batches"("chapterState");
CREATE INDEX "communications_chapterState_idx" ON "communications"("chapterState");
CREATE INDEX "donors_chapterState_idx" ON "donors"("chapterState");
CREATE INDEX "employers_chapterState_idx" ON "employers"("chapterState");
CREATE INDEX "events_chapterState_idx" ON "events"("chapterState");
CREATE INDEX "households_chapterState_idx" ON "households"("chapterState");
CREATE INDEX "participant_profiles_chapterState_idx" ON "participant_profiles"("chapterState");
CREATE INDEX "vehicles_chapterState_idx" ON "vehicles"("chapterState");
CREATE INDEX "vendors_chapterState_idx" ON "vendors"("chapterState");
CREATE INDEX "volunteer_profiles_chapterState_idx" ON "volunteer_profiles"("chapterState");
