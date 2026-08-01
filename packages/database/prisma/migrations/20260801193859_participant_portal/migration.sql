-- CreateEnum
CREATE TYPE "PortalMessageStatus" AS ENUM ('new', 'read', 'responded');

-- CreateEnum
CREATE TYPE "MeetingRequestStatus" AS ENUM ('pending', 'scheduled', 'declined', 'canceled');

-- CreateEnum
CREATE TYPE "TransportRequestStatus" AS ENUM ('pending', 'approved', 'denied', 'canceled', 'completed');

-- CreateTable
CREATE TABLE "participant_portal_tokens" (
    "id" TEXT NOT NULL,
    "participantProfileId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "participant_portal_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portal_messages" (
    "id" TEXT NOT NULL,
    "participantProfileId" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "status" "PortalMessageStatus" NOT NULL DEFAULT 'new',
    "staffNotes" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "portal_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meeting_requests" (
    "id" TEXT NOT NULL,
    "participantProfileId" TEXT NOT NULL,
    "preferredDate" TIMESTAMP(3) NOT NULL,
    "preferredTime" TEXT,
    "reason" TEXT NOT NULL,
    "status" "MeetingRequestStatus" NOT NULL DEFAULT 'pending',
    "scheduledFor" TIMESTAMP(3),
    "decisionNotes" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "meeting_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transport_requests" (
    "id" TEXT NOT NULL,
    "participantProfileId" TEXT NOT NULL,
    "tripDate" TIMESTAMP(3) NOT NULL,
    "tripTime" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "purpose" TEXT,
    "returnTripRequested" BOOLEAN NOT NULL DEFAULT false,
    "returnDate" TIMESTAMP(3),
    "returnTime" TEXT,
    "returnDestination" TEXT,
    "status" "TransportRequestStatus" NOT NULL DEFAULT 'pending',
    "assignedVehicleId" TEXT,
    "decisionNotes" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "transport_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "participant_portal_tokens_token_key" ON "participant_portal_tokens"("token");

-- CreateIndex
CREATE INDEX "participant_portal_tokens_participantProfileId_idx" ON "participant_portal_tokens"("participantProfileId");

-- CreateIndex
CREATE INDEX "portal_messages_participantProfileId_createdAt_idx" ON "portal_messages"("participantProfileId", "createdAt");

-- CreateIndex
CREATE INDEX "portal_messages_status_idx" ON "portal_messages"("status");

-- CreateIndex
CREATE INDEX "meeting_requests_participantProfileId_createdAt_idx" ON "meeting_requests"("participantProfileId", "createdAt");

-- CreateIndex
CREATE INDEX "meeting_requests_status_idx" ON "meeting_requests"("status");

-- CreateIndex
CREATE INDEX "transport_requests_participantProfileId_createdAt_idx" ON "transport_requests"("participantProfileId", "createdAt");

-- CreateIndex
CREATE INDEX "transport_requests_status_tripDate_idx" ON "transport_requests"("status", "tripDate");

-- AddForeignKey
ALTER TABLE "participant_portal_tokens" ADD CONSTRAINT "participant_portal_tokens_participantProfileId_fkey" FOREIGN KEY ("participantProfileId") REFERENCES "participant_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_messages" ADD CONSTRAINT "portal_messages_participantProfileId_fkey" FOREIGN KEY ("participantProfileId") REFERENCES "participant_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_requests" ADD CONSTRAINT "meeting_requests_participantProfileId_fkey" FOREIGN KEY ("participantProfileId") REFERENCES "participant_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_requests" ADD CONSTRAINT "transport_requests_participantProfileId_fkey" FOREIGN KEY ("participantProfileId") REFERENCES "participant_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_requests" ADD CONSTRAINT "transport_requests_assignedVehicleId_fkey" FOREIGN KEY ("assignedVehicleId") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
