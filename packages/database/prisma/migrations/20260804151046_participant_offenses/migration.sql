-- CreateEnum
CREATE TYPE "OffenseType" AS ENUM ('violent', 'non_violent');

-- CreateTable
CREATE TABLE "participant_offenses" (
    "id" TEXT NOT NULL,
    "participantProfileId" TEXT NOT NULL,
    "offense" TEXT NOT NULL,
    "offenseType" "OffenseType" NOT NULL,
    "convictionDate" DATE,
    "sentenceYears" INTEGER,
    "sentenceMonths" INTEGER,
    "sentenceDays" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "participant_offenses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "participant_offenses_participantProfileId_idx" ON "participant_offenses"("participantProfileId");

-- AddForeignKey
ALTER TABLE "participant_offenses" ADD CONSTRAINT "participant_offenses_participantProfileId_fkey" FOREIGN KEY ("participantProfileId") REFERENCES "participant_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
