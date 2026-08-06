-- CreateEnum
CREATE TYPE "GiftFrequency" AS ENUM ('weekly', 'biweekly', 'monthly', 'quarterly', 'semiannually', 'annually');

-- CreateEnum
CREATE TYPE "PledgeStatus" AS ENUM ('active', 'fulfilled', 'written_off', 'canceled');

-- CreateEnum
CREATE TYPE "RecurringGiftStatus" AS ENUM ('active', 'paused', 'closed');

-- CreateEnum
CREATE TYPE "InteractionChannel" AS ENUM ('email', 'phone', 'mail', 'in_person', 'text_message', 'social_media', 'website', 'other');

-- CreateEnum
CREATE TYPE "InteractionPurpose" AS ENUM ('acknowledgment', 'cultivation', 'newsletter', 'receipt', 'solicitation', 'event_followup', 'pledge_reminder', 'welcome', 'other');

-- CreateEnum
CREATE TYPE "DonorTaskStatus" AS ENUM ('open', 'completed', 'canceled');

-- CreateEnum
CREATE TYPE "TributeType" AS ENUM ('in_honor_of', 'in_memory_of');

-- CreateEnum
CREATE TYPE "OpportunityStatus" AS ENUM ('draft', 'open', 'closed', 'archived');

-- CreateEnum
CREATE TYPE "ShiftSignupStatus" AS ENUM ('signed_up', 'confirmed', 'attended', 'no_show', 'canceled', 'waitlisted');

-- CreateEnum
CREATE TYPE "HoursStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "HoursSource" AS ENUM ('staff', 'self', 'check_in');

-- DropIndex
DROP INDEX "campaigns_crmId_key";

-- DropIndex
DROP INDEX "donations_bloomerangId_key";

-- DropIndex
DROP INDEX "donors_bloomerangId_key";

-- DropIndex
DROP INDEX "events_crmId_key";

-- AlterTable
ALTER TABLE "campaigns" DROP COLUMN "crmId",
DROP COLUMN "lastSyncedAt";

-- CreateTable (created before the donations changes so existing free-text
-- fund designations can be preserved as Fund rows)
CREATE TABLE "funds" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "funds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "funds_name_key" ON "funds"("name");

-- AlterTable
ALTER TABLE "donations" ADD COLUMN     "acknowledgedAt" TIMESTAMP(3),
ADD COLUMN     "acknowledgedById" TEXT,
ADD COLUMN     "appealId" TEXT,
ADD COLUMN     "fundId" TEXT,
ADD COLUMN     "inKindDescription" TEXT,
ADD COLUMN     "inKindFairMarketValue" DECIMAL(12,2),
ADD COLUMN     "isAnonymous" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "nonDeductibleAmount" DECIMAL(12,2),
ADD COLUMN     "pledgeId" TEXT,
ADD COLUMN     "recurringGiftId" TEXT,
ADD COLUMN     "tributeName" TEXT,
ADD COLUMN     "tributeNotify" TEXT,
ADD COLUMN     "tributeType" "TributeType";

-- DataMigration: promote the old free-text donations.fund designations to
-- first-class Fund rows and re-point donations at them.
INSERT INTO "funds" ("id", "name", "updatedAt")
SELECT gen_random_uuid(), t."fund", CURRENT_TIMESTAMP
FROM (
  SELECT DISTINCT btrim("fund") AS "fund"
  FROM "donations"
  WHERE "fund" IS NOT NULL AND btrim("fund") <> ''
) t;

UPDATE "donations" d
SET "fundId" = f."id"
FROM "funds" f
WHERE btrim(d."fund") = f."name";

-- AlterTable
ALTER TABLE "donations" DROP COLUMN "bloomerangId",
DROP COLUMN "fund",
DROP COLUMN "lastSyncedAt";

-- AlterTable
ALTER TABLE "donors" DROP COLUMN "bloomerangId",
DROP COLUMN "lastSyncedAt",
ADD COLUMN     "householdId" TEXT,
ADD COLUMN     "isHeadOfHousehold" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "events" DROP COLUMN "crmId",
DROP COLUMN "lastSyncedAt";

-- DropTable
DROP TABLE "sync_runs";

-- CreateTable
CREATE TABLE "volunteer_opportunities" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "state" TEXT,
    "institutionId" TEXT,
    "outsideProgramId" TEXT,
    "eventId" TEXT,
    "location" TEXT,
    "status" "OpportunityStatus" NOT NULL DEFAULT 'open',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "volunteer_opportunities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "volunteer_shifts" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "shiftDate" DATE NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "capacity" INTEGER,
    "role" TEXT,
    "location" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "volunteer_shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "volunteer_shift_signups" (
    "id" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "volunteerProfileId" TEXT NOT NULL,
    "status" "ShiftSignupStatus" NOT NULL DEFAULT 'signed_up',
    "checkedInAt" TIMESTAMP(3),
    "checkedOutAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "volunteer_shift_signups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "volunteer_hours_entries" (
    "id" TEXT NOT NULL,
    "volunteerProfileId" TEXT NOT NULL,
    "activityDate" DATE NOT NULL,
    "hours" DECIMAL(6,2) NOT NULL,
    "description" TEXT,
    "opportunityId" TEXT,
    "shiftId" TEXT,
    "institutionId" TEXT,
    "assignmentId" TEXT,
    "source" "HoursSource" NOT NULL DEFAULT 'staff',
    "status" "HoursStatus" NOT NULL DEFAULT 'approved',
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "volunteer_hours_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "households" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "envelopeName" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "households_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "donor_relationships" (
    "id" TEXT NOT NULL,
    "donorId" TEXT NOT NULL,
    "relatedDonorId" TEXT NOT NULL,
    "relationshipType" TEXT NOT NULL,
    "reciprocalType" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "donor_relationships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appeals" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "campaignId" TEXT,
    "goalAmount" DECIMAL(12,2),
    "startDate" DATE,
    "endDate" DATE,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "appeals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pledges" (
    "id" TEXT NOT NULL,
    "donorId" TEXT NOT NULL,
    "pledgeDate" DATE NOT NULL,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "installmentAmount" DECIMAL(12,2),
    "frequency" "GiftFrequency",
    "startDate" DATE,
    "endDate" DATE,
    "campaignId" TEXT,
    "fundId" TEXT,
    "appealId" TEXT,
    "status" "PledgeStatus" NOT NULL DEFAULT 'active',
    "writtenOffAmount" DECIMAL(12,2),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "pledges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recurring_gifts" (
    "id" TEXT NOT NULL,
    "donorId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "frequency" "GiftFrequency" NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "nextGiftDate" DATE,
    "paymentMethod" TEXT,
    "campaignId" TEXT,
    "fundId" TEXT,
    "appealId" TEXT,
    "status" "RecurringGiftStatus" NOT NULL DEFAULT 'active',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "recurring_gifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "soft_credits" (
    "id" TEXT NOT NULL,
    "donationId" TEXT NOT NULL,
    "donorId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "soft_credits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "donor_interactions" (
    "id" TEXT NOT NULL,
    "donorId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "channel" "InteractionChannel" NOT NULL,
    "purpose" "InteractionPurpose" NOT NULL,
    "subject" TEXT NOT NULL,
    "notes" TEXT,
    "isInbound" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "donor_interactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "donor_tasks" (
    "id" TEXT NOT NULL,
    "donorId" TEXT NOT NULL,
    "assignedToId" TEXT,
    "subject" TEXT NOT NULL,
    "dueDate" DATE,
    "status" "DonorTaskStatus" NOT NULL DEFAULT 'open',
    "completedAt" TIMESTAMP(3),
    "channel" "InteractionChannel",
    "purpose" "InteractionPurpose",
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "donor_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "volunteer_opportunities_status_idx" ON "volunteer_opportunities"("status");

-- CreateIndex
CREATE INDEX "volunteer_opportunities_state_idx" ON "volunteer_opportunities"("state");

-- CreateIndex
CREATE INDEX "volunteer_opportunities_institutionId_idx" ON "volunteer_opportunities"("institutionId");

-- CreateIndex
CREATE INDEX "volunteer_shifts_opportunityId_shiftDate_idx" ON "volunteer_shifts"("opportunityId", "shiftDate");

-- CreateIndex
CREATE INDEX "volunteer_shifts_shiftDate_idx" ON "volunteer_shifts"("shiftDate");

-- CreateIndex
CREATE INDEX "volunteer_shift_signups_volunteerProfileId_idx" ON "volunteer_shift_signups"("volunteerProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "volunteer_shift_signups_shiftId_volunteerProfileId_key" ON "volunteer_shift_signups"("shiftId", "volunteerProfileId");

-- CreateIndex
CREATE INDEX "volunteer_hours_entries_volunteerProfileId_activityDate_idx" ON "volunteer_hours_entries"("volunteerProfileId", "activityDate");

-- CreateIndex
CREATE INDEX "volunteer_hours_entries_status_idx" ON "volunteer_hours_entries"("status");

-- CreateIndex
CREATE INDEX "volunteer_hours_entries_opportunityId_idx" ON "volunteer_hours_entries"("opportunityId");

-- CreateIndex
CREATE INDEX "households_name_idx" ON "households"("name");

-- CreateIndex
CREATE INDEX "donor_relationships_relatedDonorId_idx" ON "donor_relationships"("relatedDonorId");

-- CreateIndex
CREATE UNIQUE INDEX "donor_relationships_donorId_relatedDonorId_key" ON "donor_relationships"("donorId", "relatedDonorId");

-- CreateIndex
CREATE INDEX "appeals_campaignId_idx" ON "appeals"("campaignId");

-- CreateIndex
CREATE INDEX "pledges_donorId_idx" ON "pledges"("donorId");

-- CreateIndex
CREATE INDEX "pledges_status_idx" ON "pledges"("status");

-- CreateIndex
CREATE INDEX "recurring_gifts_donorId_idx" ON "recurring_gifts"("donorId");

-- CreateIndex
CREATE INDEX "recurring_gifts_status_idx" ON "recurring_gifts"("status");

-- CreateIndex
CREATE INDEX "soft_credits_donorId_idx" ON "soft_credits"("donorId");

-- CreateIndex
CREATE UNIQUE INDEX "soft_credits_donationId_donorId_key" ON "soft_credits"("donationId", "donorId");

-- CreateIndex
CREATE INDEX "donor_interactions_donorId_date_idx" ON "donor_interactions"("donorId", "date");

-- CreateIndex
CREATE INDEX "donor_tasks_donorId_idx" ON "donor_tasks"("donorId");

-- CreateIndex
CREATE INDEX "donor_tasks_status_dueDate_idx" ON "donor_tasks"("status", "dueDate");

-- CreateIndex
CREATE INDEX "donor_tasks_assignedToId_status_idx" ON "donor_tasks"("assignedToId", "status");

-- CreateIndex
CREATE INDEX "donations_fundId_idx" ON "donations"("fundId");

-- CreateIndex
CREATE INDEX "donations_appealId_idx" ON "donations"("appealId");

-- CreateIndex
CREATE INDEX "donations_pledgeId_idx" ON "donations"("pledgeId");

-- CreateIndex
CREATE INDEX "donations_recurringGiftId_idx" ON "donations"("recurringGiftId");

-- CreateIndex
CREATE INDEX "donations_acknowledgedAt_idx" ON "donations"("acknowledgedAt");

-- CreateIndex
CREATE INDEX "donors_householdId_idx" ON "donors"("householdId");

-- AddForeignKey
ALTER TABLE "volunteer_opportunities" ADD CONSTRAINT "volunteer_opportunities_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "volunteer_opportunities" ADD CONSTRAINT "volunteer_opportunities_outsideProgramId_fkey" FOREIGN KEY ("outsideProgramId") REFERENCES "outside_programs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "volunteer_opportunities" ADD CONSTRAINT "volunteer_opportunities_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "volunteer_shifts" ADD CONSTRAINT "volunteer_shifts_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "volunteer_opportunities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "volunteer_shift_signups" ADD CONSTRAINT "volunteer_shift_signups_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "volunteer_shifts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "volunteer_shift_signups" ADD CONSTRAINT "volunteer_shift_signups_volunteerProfileId_fkey" FOREIGN KEY ("volunteerProfileId") REFERENCES "volunteer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "volunteer_hours_entries" ADD CONSTRAINT "volunteer_hours_entries_volunteerProfileId_fkey" FOREIGN KEY ("volunteerProfileId") REFERENCES "volunteer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "volunteer_hours_entries" ADD CONSTRAINT "volunteer_hours_entries_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "volunteer_opportunities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "volunteer_hours_entries" ADD CONSTRAINT "volunteer_hours_entries_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "volunteer_shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "volunteer_hours_entries" ADD CONSTRAINT "volunteer_hours_entries_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "volunteer_hours_entries" ADD CONSTRAINT "volunteer_hours_entries_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "volunteer_assignments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "donors" ADD CONSTRAINT "donors_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "donor_relationships" ADD CONSTRAINT "donor_relationships_donorId_fkey" FOREIGN KEY ("donorId") REFERENCES "donors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "donor_relationships" ADD CONSTRAINT "donor_relationships_relatedDonorId_fkey" FOREIGN KEY ("relatedDonorId") REFERENCES "donors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appeals" ADD CONSTRAINT "appeals_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pledges" ADD CONSTRAINT "pledges_donorId_fkey" FOREIGN KEY ("donorId") REFERENCES "donors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pledges" ADD CONSTRAINT "pledges_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pledges" ADD CONSTRAINT "pledges_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "funds"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pledges" ADD CONSTRAINT "pledges_appealId_fkey" FOREIGN KEY ("appealId") REFERENCES "appeals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_gifts" ADD CONSTRAINT "recurring_gifts_donorId_fkey" FOREIGN KEY ("donorId") REFERENCES "donors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_gifts" ADD CONSTRAINT "recurring_gifts_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_gifts" ADD CONSTRAINT "recurring_gifts_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "funds"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_gifts" ADD CONSTRAINT "recurring_gifts_appealId_fkey" FOREIGN KEY ("appealId") REFERENCES "appeals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "donations" ADD CONSTRAINT "donations_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "funds"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "donations" ADD CONSTRAINT "donations_appealId_fkey" FOREIGN KEY ("appealId") REFERENCES "appeals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "donations" ADD CONSTRAINT "donations_pledgeId_fkey" FOREIGN KEY ("pledgeId") REFERENCES "pledges"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "donations" ADD CONSTRAINT "donations_recurringGiftId_fkey" FOREIGN KEY ("recurringGiftId") REFERENCES "recurring_gifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "soft_credits" ADD CONSTRAINT "soft_credits_donationId_fkey" FOREIGN KEY ("donationId") REFERENCES "donations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "soft_credits" ADD CONSTRAINT "soft_credits_donorId_fkey" FOREIGN KEY ("donorId") REFERENCES "donors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "donor_interactions" ADD CONSTRAINT "donor_interactions_donorId_fkey" FOREIGN KEY ("donorId") REFERENCES "donors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "donor_tasks" ADD CONSTRAINT "donor_tasks_donorId_fkey" FOREIGN KEY ("donorId") REFERENCES "donors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

