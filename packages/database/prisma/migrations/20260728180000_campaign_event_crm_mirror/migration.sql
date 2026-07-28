-- Campaigns/events join the donor-CRM mirror: external upsert key + sync stamp.

-- AlterTable
ALTER TABLE "campaigns" ADD COLUMN     "crmId" TEXT,
ADD COLUMN     "lastSyncedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "events" ADD COLUMN     "crmId" TEXT,
ADD COLUMN     "lastSyncedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "campaigns_crmId_key" ON "campaigns"("crmId");

-- CreateIndex
CREATE UNIQUE INDEX "events_crmId_key" ON "events"("crmId");
