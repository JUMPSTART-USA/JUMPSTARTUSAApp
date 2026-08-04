-- CreateEnum
CREATE TYPE "InsideLocationStatus" AS ENUM ('active', 'inactive');

-- CreateTable
CREATE TABLE "participant_inside_locations" (
    "id" TEXT NOT NULL,
    "participantProfileId" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "status" "InsideLocationStatus" NOT NULL DEFAULT 'active',
    "startDate" DATE,
    "endDate" DATE,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "participant_inside_locations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "participant_inside_locations_participantProfileId_status_idx" ON "participant_inside_locations"("participantProfileId", "status");

-- CreateIndex
CREATE INDEX "participant_inside_locations_institutionId_idx" ON "participant_inside_locations"("institutionId");

-- AddForeignKey
ALTER TABLE "participant_inside_locations" ADD CONSTRAINT "participant_inside_locations_participantProfileId_fkey" FOREIGN KEY ("participantProfileId") REFERENCES "participant_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participant_inside_locations" ADD CONSTRAINT "participant_inside_locations_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
