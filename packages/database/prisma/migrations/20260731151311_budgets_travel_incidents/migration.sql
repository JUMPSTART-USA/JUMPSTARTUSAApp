-- CreateEnum
CREATE TYPE "BudgetCategory" AS ENUM ('program_fee', 'tithe', 'supervision_fee', 'treatment_program', 'restitution', 'child_support', 'rent', 'utilities', 'transportation', 'phone', 'medical', 'personal', 'savings', 'other');

-- CreateEnum
CREATE TYPE "BudgetFrequency" AS ENUM ('weekly', 'biweekly', 'monthly', 'one_time');

-- CreateEnum
CREATE TYPE "TravelRequestStatus" AS ENUM ('pending', 'approved', 'denied', 'canceled');

-- CreateEnum
CREATE TYPE "IncidentCategory" AS ENUM ('curfew_violation', 'unauthorized_absence', 'substance_use', 'failed_drug_test', 'contraband', 'altercation', 'property_damage', 'noncompliance', 'other');

-- CreateEnum
CREATE TYPE "IncidentSeverity" AS ENUM ('minor', 'major', 'critical');

-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('open', 'in_review', 'resolved', 'dismissed');

-- CreateTable
CREATE TABLE "budget_items" (
    "id" TEXT NOT NULL,
    "participantProfileId" TEXT NOT NULL,
    "category" "BudgetCategory" NOT NULL,
    "label" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "frequency" "BudgetFrequency" NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "budget_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_payments" (
    "id" TEXT NOT NULL,
    "budgetItemId" TEXT NOT NULL,
    "participantProfileId" TEXT NOT NULL,
    "paidDate" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "method" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "budget_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "travel_requests" (
    "id" TEXT NOT NULL,
    "participantProfileId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "destination" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "status" "TravelRequestStatus" NOT NULL DEFAULT 'pending',
    "decisionNotes" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "travel_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incident_reports" (
    "id" TEXT NOT NULL,
    "participantProfileId" TEXT NOT NULL,
    "incidentDate" TIMESTAMP(3) NOT NULL,
    "category" "IncidentCategory" NOT NULL,
    "severity" "IncidentSeverity" NOT NULL,
    "description" TEXT NOT NULL,
    "actionTaken" TEXT,
    "status" "IncidentStatus" NOT NULL DEFAULT 'open',
    "resolutionNotes" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "incident_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "budget_items_participantProfileId_active_idx" ON "budget_items"("participantProfileId", "active");

-- CreateIndex
CREATE INDEX "budget_payments_budgetItemId_idx" ON "budget_payments"("budgetItemId");

-- CreateIndex
CREATE INDEX "budget_payments_participantProfileId_paidDate_idx" ON "budget_payments"("participantProfileId", "paidDate");

-- CreateIndex
CREATE INDEX "travel_requests_participantProfileId_startDate_idx" ON "travel_requests"("participantProfileId", "startDate");

-- CreateIndex
CREATE INDEX "travel_requests_status_idx" ON "travel_requests"("status");

-- CreateIndex
CREATE INDEX "incident_reports_participantProfileId_incidentDate_idx" ON "incident_reports"("participantProfileId", "incidentDate");

-- CreateIndex
CREATE INDEX "incident_reports_status_idx" ON "incident_reports"("status");

-- AddForeignKey
ALTER TABLE "budget_items" ADD CONSTRAINT "budget_items_participantProfileId_fkey" FOREIGN KEY ("participantProfileId") REFERENCES "participant_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_payments" ADD CONSTRAINT "budget_payments_budgetItemId_fkey" FOREIGN KEY ("budgetItemId") REFERENCES "budget_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_payments" ADD CONSTRAINT "budget_payments_participantProfileId_fkey" FOREIGN KEY ("participantProfileId") REFERENCES "participant_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "travel_requests" ADD CONSTRAINT "travel_requests_participantProfileId_fkey" FOREIGN KEY ("participantProfileId") REFERENCES "participant_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_reports" ADD CONSTRAINT "incident_reports_participantProfileId_fkey" FOREIGN KEY ("participantProfileId") REFERENCES "participant_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
