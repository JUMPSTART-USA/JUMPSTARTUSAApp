-- CreateEnum
CREATE TYPE "DrugTestType" AS ENUM ('urine_5_panel', 'urine_10_panel', 'urine_12_panel', 'saliva', 'breathalyzer', 'hair_follicle', 'other');

-- CreateEnum
CREATE TYPE "DrugTestResult" AS ENUM ('negative', 'positive', 'inconclusive', 'diluted', 'refused');

-- CreateTable
CREATE TABLE "drug_tests" (
    "id" TEXT NOT NULL,
    "participantProfileId" TEXT NOT NULL,
    "testDate" TIMESTAMP(3) NOT NULL,
    "testType" "DrugTestType" NOT NULL,
    "result" "DrugTestResult" NOT NULL,
    "notes" TEXT,
    "photoData" BYTEA,
    "photoMimeType" TEXT,
    "photoFileName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "drug_tests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "drug_tests_participantProfileId_testDate_idx" ON "drug_tests"("participantProfileId", "testDate");

-- AddForeignKey
ALTER TABLE "drug_tests" ADD CONSTRAINT "drug_tests_participantProfileId_fkey" FOREIGN KEY ("participantProfileId") REFERENCES "participant_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
