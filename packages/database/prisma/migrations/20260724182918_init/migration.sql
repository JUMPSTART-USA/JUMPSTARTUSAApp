-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('male', 'female', 'other', 'unspecified');

-- CreateEnum
CREATE TYPE "InsideStatus" AS ENUM ('not_applicable', 'enrolled', 'active', 'completed', 'released', 'withdrawn');

-- CreateEnum
CREATE TYPE "OutsideStatus" AS ENUM ('not_applicable', 'intake', 'active', 'completed', 'inactive', 'withdrawn');

-- CreateEnum
CREATE TYPE "AlumniStatus" AS ENUM ('not_applicable', 'alumni', 'alumni_engaged');

-- CreateEnum
CREATE TYPE "EnrollmentStatus" AS ENUM ('enrolled', 'active', 'completed', 'assessment_pending', 'left_early', 'removed', 'transferred');

-- CreateEnum
CREATE TYPE "HousingStatus" AS ENUM ('active', 'completed', 'assessment_pending', 'left_early', 'removed', 'transferred');

-- CreateEnum
CREATE TYPE "FinalAssessment" AS ENUM ('blue', 'green', 'yellow', 'red');

-- CreateEnum
CREATE TYPE "ClassStatus" AS ENUM ('planned', 'active', 'completed', 'canceled');

-- CreateEnum
CREATE TYPE "ProgramType" AS ENUM ('transitional_housing', 'treatment', 'life_skills', 'soft_skills', 'bible_study', 'mentoring', 'transportation', 'employment_assistance', 'case_management', 'other');

-- CreateEnum
CREATE TYPE "ContactType" AS ENUM ('phone', 'in_person', 'email', 'text', 'video', 'other');

-- CreateEnum
CREATE TYPE "NoteCategory" AS ENUM ('housing', 'employment', 'treatment', 'transportation', 'life_skills', 'spiritual_support', 'legal', 'family', 'financial', 'general');

-- CreateEnum
CREATE TYPE "ChecklistItemStatus" AS ENUM ('pending', 'in_progress', 'completed', 'not_applicable');

-- CreateEnum
CREATE TYPE "GoalStatus" AS ENUM ('not_started', 'in_progress', 'achieved', 'abandoned');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('open', 'in_progress', 'completed', 'canceled');

-- CreateEnum
CREATE TYPE "VolunteerStatus" AS ENUM ('applicant', 'active', 'inactive', 'suspended');

-- CreateEnum
CREATE TYPE "AssignmentType" AS ENUM ('inside_class', 'outside_class', 'bible_study', 'event', 'transportation', 'mentoring', 'administration', 'other');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('proposed', 'active', 'completed', 'ended');

-- CreateEnum
CREATE TYPE "BackgroundCheckResult" AS ENUM ('pending', 'clear', 'review', 'not_cleared');

-- CreateEnum
CREATE TYPE "ClearanceRequirementType" AS ENUM ('background_check', 'training', 'document', 'approval', 'medical', 'other');

-- CreateEnum
CREATE TYPE "ClearanceStatus" AS ENUM ('pending', 'satisfied', 'expired', 'rejected');

-- CreateEnum
CREATE TYPE "MentorScreeningStage" AS ENUM ('applied', 'interview', 'background_check', 'references', 'mentor_training', 'panel_approval', 'approved', 'rejected', 'withdrawn');

-- CreateEnum
CREATE TYPE "MentorAssignmentStatus" AS ENUM ('proposed', 'active', 'paused', 'ended');

-- CreateEnum
CREATE TYPE "SessionMode" AS ENUM ('in_person', 'phone', 'video');

-- CreateEnum
CREATE TYPE "EngagementType" AS ENUM ('event_attendance', 'check_in_call', 'newsletter', 'volunteer_service', 'gave_testimony', 'donated', 'other');

-- CreateEnum
CREATE TYPE "CheckinWave" AS ENUM ('day_30', 'month_6', 'month_12', 'month_24', 'month_36');

-- CreateEnum
CREATE TYPE "CheckinMethod" AS ENUM ('call', 'sms', 'mail', 'event', 'self_report', 'in_person');

-- CreateEnum
CREATE TYPE "VerificationLevel" AS ENUM ('self_reported', 'staff_verified', 'doc_verified');

-- CreateEnum
CREATE TYPE "DonorType" AS ENUM ('individual', 'organization', 'church', 'business', 'foundation');

-- CreateEnum
CREATE TYPE "EmploymentStatus" AS ENUM ('applied', 'interviewing', 'hired', 'active', 'terminated', 'resigned', 'completed', 'unknown');

-- CreateEnum
CREATE TYPE "HiringStatus" AS ENUM ('prospect', 'partner', 'actively_hiring', 'paused', 'inactive');

-- CreateEnum
CREATE TYPE "CommChannel" AS ENUM ('email', 'sms', 'letter');

-- CreateEnum
CREATE TYPE "CommStatus" AS ENUM ('queued', 'sent', 'delivered', 'failed', 'returned');

-- CreateEnum
CREATE TYPE "IntakeStatus" AS ENUM ('pending', 'in_review', 'approved', 'rejected', 'spam');

-- CreateEnum
CREATE TYPE "ReferrerType" AS ENUM ('self', 'family', 'chaplain', 'agency', 'church', 'other');

-- CreateEnum
CREATE TYPE "AttachmentSensitivity" AS ENUM ('standard', 'sensitive', 'confidential');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('create', 'update', 'delete', 'login', 'logout', 'login_failed', 'export', 'permission_change', 'read_confidential', 'merge');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('invited', 'active', 'deactivated');

-- CreateTable
CREATE TABLE "persons" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "middleName" TEXT,
    "lastName" TEXT NOT NULL,
    "preferredName" TEXT,
    "suffix" TEXT,
    "dateOfBirth" DATE,
    "gender" "Gender" NOT NULL DEFAULT 'unspecified',
    "preferredLanguage" TEXT NOT NULL DEFAULT 'en',
    "primaryPhone" TEXT,
    "primaryEmail" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zip" TEXT,
    "emailOk" BOOLEAN NOT NULL DEFAULT true,
    "smsOk" BOOLEAN NOT NULL DEFAULT false,
    "smsConsentAt" TIMESTAMP(3),
    "mailOnly" BOOLEAN NOT NULL DEFAULT false,
    "doNotContact" BOOLEAN NOT NULL DEFAULT false,
    "emailBouncedAt" TIMESTAMP(3),
    "deceasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "persons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "person_addresses" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "addressLine1" TEXT NOT NULL,
    "addressLine2" TEXT,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "zip" TEXT NOT NULL,
    "addressType" TEXT,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "validFrom" DATE,
    "validTo" DATE,
    "returnedMailAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "person_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "person_contacts" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "isEmergency" BOOLEAN NOT NULL DEFAULT false,
    "isMinor" BOOLEAN NOT NULL DEFAULT false,
    "guardianName" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "person_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "testimony_consents" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "grantedAt" DATE NOT NULL,
    "revokedAt" DATE,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "testimony_consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "participant_profiles" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "participantNumber" TEXT NOT NULL,
    "insideStatus" "InsideStatus" NOT NULL DEFAULT 'not_applicable',
    "outsideStatus" "OutsideStatus" NOT NULL DEFAULT 'not_applicable',
    "phase" TEXT,
    "alumniStatus" "AlumniStatus" NOT NULL DEFAULT 'not_applicable',
    "intakeDate" DATE,
    "releaseDate" DATE,
    "graduationDate" DATE,
    "assignedCaseManagerId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "participant_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "participant_doc_ids" (
    "id" TEXT NOT NULL,
    "participantProfileId" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "docNumber" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'staff_entered',
    "dataSharingAgreementId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "participant_doc_ids_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "participant_status_history" (
    "id" TEXT NOT NULL,
    "participantProfileId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "fromValue" TEXT,
    "toValue" TEXT NOT NULL,
    "effectiveDate" DATE NOT NULL,
    "reason" TEXT,
    "changedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "participant_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "volunteer_profiles" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "status" "VolunteerStatus" NOT NULL DEFAULT 'applicant',
    "isMentor" BOOLEAN NOT NULL DEFAULT false,
    "mentorStatus" TEXT,
    "volunteerRoles" TEXT[],
    "availability" TEXT,
    "churchAffiliation" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "volunteer_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'invited',
    "personId" TEXT,
    "totpSecret" TEXT,
    "totpEnabled" BOOLEAN NOT NULL DEFAULT false,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_region_scopes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "state" TEXT NOT NULL,

    CONSTRAINT "user_region_scopes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "sid" TEXT NOT NULL,
    "sess" JSONB NOT NULL,
    "expire" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
);

-- CreateTable
CREATE TABLE "institutions" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "institutionType" TEXT,
    "addressLine1" TEXT,
    "city" TEXT,
    "state" TEXT NOT NULL,
    "zip" TEXT,
    "mainPhone" TEXT,
    "chaplainName" TEXT,
    "chaplainPhone" TEXT,
    "chaplainEmail" TEXT,
    "primaryContactName" TEXT,
    "primaryContactRole" TEXT,
    "primaryContactPhone" TEXT,
    "primaryContactEmail" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "institutions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inside_classes" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "classType" TEXT,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "status" "ClassStatus" NOT NULL DEFAULT 'planned',
    "staffLeadId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "inside_classes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inside_class_enrollments" (
    "id" TEXT NOT NULL,
    "participantProfileId" TEXT NOT NULL,
    "insideClassId" TEXT NOT NULL,
    "enrollmentDate" DATE NOT NULL,
    "completionStatus" "EnrollmentStatus" NOT NULL DEFAULT 'enrolled',
    "completionDate" DATE,
    "leftEarlyDate" DATE,
    "leftEarlyReason" TEXT,
    "finalAssessment" "FinalAssessment",
    "assessmentNotes" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "inside_class_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inside_class_sessions" (
    "id" TEXT NOT NULL,
    "insideClassId" TEXT NOT NULL,
    "sessionDate" DATE NOT NULL,
    "topic" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "inside_class_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inside_class_session_attendance" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inside_class_session_attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outside_programs" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "programType" "ProgramType" NOT NULL,
    "location" TEXT,
    "state" TEXT,
    "startDate" DATE,
    "endDate" DATE,
    "recurringSchedule" TEXT,
    "staffLeadId" TEXT,
    "volunteerLeadName" TEXT,
    "capacity" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'active',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "outside_programs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outside_program_enrollments" (
    "id" TEXT NOT NULL,
    "participantProfileId" TEXT NOT NULL,
    "outsideProgramId" TEXT NOT NULL,
    "enrollmentDate" DATE NOT NULL,
    "status" "EnrollmentStatus" NOT NULL DEFAULT 'enrolled',
    "completionDate" DATE,
    "leftEarlyDate" DATE,
    "leftEarlyReason" TEXT,
    "completionAssessment" "FinalAssessment",
    "assessmentNotes" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "outside_program_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outside_program_sessions" (
    "id" TEXT NOT NULL,
    "outsideProgramId" TEXT NOT NULL,
    "sessionDate" DATE NOT NULL,
    "topic" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "outside_program_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outside_program_session_attendance" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outside_program_session_attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transitional_homes" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "addressLine1" TEXT,
    "city" TEXT,
    "state" TEXT NOT NULL,
    "zip" TEXT,
    "phone" TEXT,
    "houseManagerName" TEXT,
    "houseManagerPhone" TEXT,
    "houseManagerEmail" TEXT,
    "capacity" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "transitional_homes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "housing_enrollments" (
    "id" TEXT NOT NULL,
    "participantProfileId" TEXT NOT NULL,
    "homeId" TEXT NOT NULL,
    "moveInDate" DATE NOT NULL,
    "moveOutDate" DATE,
    "status" "HousingStatus" NOT NULL DEFAULT 'active',
    "reasonForLeaving" TEXT,
    "completionAssessment" "FinalAssessment",
    "assessmentNotes" TEXT,
    "outsideProgramEnrollmentId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "housing_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onboarding_checklist_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "onboarding_checklist_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onboarding_checklist_template_items" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "onboarding_checklist_template_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onboarding_checklists" (
    "id" TEXT NOT NULL,
    "participantProfileId" TEXT NOT NULL,
    "templateId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "onboarding_checklists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onboarding_checklist_items" (
    "id" TEXT NOT NULL,
    "checklistId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "templateItemId" TEXT,
    "status" "ChecklistItemStatus" NOT NULL DEFAULT 'pending',
    "completedAt" TIMESTAMP(3),
    "completedById" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "onboarding_checklist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_notes" (
    "id" TEXT NOT NULL,
    "participantProfileId" TEXT NOT NULL,
    "caseManagerId" TEXT NOT NULL,
    "noteDate" DATE NOT NULL,
    "contactType" "ContactType" NOT NULL,
    "category" "NoteCategory" NOT NULL,
    "content" TEXT NOT NULL,
    "followUpRequired" BOOLEAN NOT NULL DEFAULT false,
    "followUpDate" DATE,
    "followUpDoneAt" TIMESTAMP(3),
    "confidential" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "case_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_services" (
    "id" TEXT NOT NULL,
    "participantProfileId" TEXT NOT NULL,
    "serviceType" TEXT NOT NULL,
    "serviceDate" DATE NOT NULL,
    "providerName" TEXT,
    "description" TEXT,
    "outcome" TEXT,
    "followUpRequired" BOOLEAN NOT NULL DEFAULT false,
    "followUpDate" DATE,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "case_services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_plans" (
    "id" TEXT NOT NULL,
    "participantProfileId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Service Plan',
    "status" TEXT NOT NULL DEFAULT 'active',
    "reviewDate" DATE,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "service_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goals" (
    "id" TEXT NOT NULL,
    "servicePlanId" TEXT NOT NULL,
    "category" "NoteCategory" NOT NULL,
    "description" TEXT NOT NULL,
    "targetDate" DATE,
    "status" "GoalStatus" NOT NULL DEFAULT 'not_started',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "goals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goal_milestones" (
    "id" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "dueDate" DATE,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "goal_milestones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_tasks" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "details" TEXT,
    "assignedToId" TEXT NOT NULL,
    "dueDate" DATE,
    "status" "TaskStatus" NOT NULL DEFAULT 'open',
    "completedAt" TIMESTAMP(3),
    "participantProfileId" TEXT,
    "goalId" TEXT,
    "outboundReferralId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "case_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbound_referrals" (
    "id" TEXT NOT NULL,
    "participantProfileId" TEXT NOT NULL,
    "vendorId" TEXT,
    "providerName" TEXT,
    "reason" TEXT NOT NULL,
    "referralDate" DATE NOT NULL,
    "outcome" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "outbound_referrals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "needs_assessments" (
    "id" TEXT NOT NULL,
    "participantProfileId" TEXT NOT NULL,
    "instrumentName" TEXT NOT NULL,
    "administeredAt" DATE NOT NULL,
    "administeredByName" TEXT,
    "domainScores" JSONB,
    "summary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "needs_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "volunteer_assignments" (
    "id" TEXT NOT NULL,
    "volunteerProfileId" TEXT NOT NULL,
    "assignmentType" "AssignmentType" NOT NULL,
    "institutionId" TEXT,
    "insideClassId" TEXT,
    "outsideProgramId" TEXT,
    "eventId" TEXT,
    "role" TEXT,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'active',
    "notes" TEXT,
    "clearanceOverride" BOOLEAN NOT NULL DEFAULT false,
    "clearanceOverrideReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "volunteer_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "background_checks" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "vendor" TEXT NOT NULL,
    "package" TEXT,
    "orderedAt" DATE NOT NULL,
    "completedAt" DATE,
    "result" "BackgroundCheckResult" NOT NULL DEFAULT 'pending',
    "expiresAt" DATE,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "background_checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "volunteer_trainings" (
    "id" TEXT NOT NULL,
    "volunteerProfileId" TEXT NOT NULL,
    "trainingType" TEXT NOT NULL,
    "completedAt" DATE NOT NULL,
    "expiresAt" DATE,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "volunteer_trainings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "facility_clearance_requirements" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "requirementType" "ClearanceRequirementType" NOT NULL,
    "description" TEXT,
    "renewalMonths" INTEGER,
    "hardBlock" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "facility_clearance_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "volunteer_clearances" (
    "id" TEXT NOT NULL,
    "volunteerProfileId" TEXT NOT NULL,
    "requirementId" TEXT NOT NULL,
    "status" "ClearanceStatus" NOT NULL DEFAULT 'pending',
    "issuedAt" DATE,
    "expiresAt" DATE,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "volunteer_clearances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alumni_engagements" (
    "id" TEXT NOT NULL,
    "participantProfileId" TEXT NOT NULL,
    "engagementType" "EngagementType" NOT NULL,
    "engagementDate" DATE NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "alumni_engagements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outcome_checkins" (
    "id" TEXT NOT NULL,
    "participantProfileId" TEXT NOT NULL,
    "wave" "CheckinWave" NOT NULL,
    "dueDate" DATE NOT NULL,
    "completedDate" DATE,
    "method" "CheckinMethod",
    "collectedById" TEXT,
    "employmentStatus" TEXT,
    "housingStatus" TEXT,
    "wellbeingFields" JSONB,
    "reArrested" BOOLEAN,
    "reArrestedVerification" "VerificationLevel",
    "reConvicted" BOOLEAN,
    "reConvictedVerification" "VerificationLevel",
    "reIncarcerated" BOOLEAN,
    "reIncarceratedVerification" "VerificationLevel",
    "justiceNotes" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "outcome_checkins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mentor_screening_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "mentor_screening_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mentor_screening_template_items" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "mentor_screening_template_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mentor_screenings" (
    "id" TEXT NOT NULL,
    "volunteerProfileId" TEXT NOT NULL,
    "stage" "MentorScreeningStage" NOT NULL DEFAULT 'applied',
    "templateId" TEXT,
    "approvedAt" DATE,
    "approvedById" TEXT,
    "conditions" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "mentor_screenings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mentor_screening_criteria" (
    "id" TEXT NOT NULL,
    "screeningId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "status" "ChecklistItemStatus" NOT NULL DEFAULT 'pending',
    "completedAt" TIMESTAMP(3),
    "completedById" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mentor_screening_criteria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mentor_screening_steps" (
    "id" TEXT NOT NULL,
    "screeningId" TEXT NOT NULL,
    "stage" "MentorScreeningStage" NOT NULL,
    "outcome" TEXT,
    "completedAt" DATE,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mentor_screening_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mentor_assignments" (
    "id" TEXT NOT NULL,
    "mentorProfileId" TEXT NOT NULL,
    "participantProfileId" TEXT NOT NULL,
    "matchedById" TEXT,
    "startDate" DATE,
    "endDate" DATE,
    "status" "MentorAssignmentStatus" NOT NULL DEFAULT 'proposed',
    "endReason" TEXT,
    "pauseReason" TEXT,
    "matchRationale" TEXT,
    "meetingCadence" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "mentor_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mentor_session_logs" (
    "id" TEXT NOT NULL,
    "mentorAssignmentId" TEXT NOT NULL,
    "sessionDate" DATE NOT NULL,
    "mode" "SessionMode" NOT NULL,
    "durationMinutes" INTEGER,
    "participantProgress" TEXT,
    "concernsEscalated" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "mentor_session_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "donors" (
    "id" TEXT NOT NULL,
    "bloomerangId" TEXT,
    "donorType" "DonorType" NOT NULL DEFAULT 'individual',
    "name" TEXT NOT NULL,
    "contactPerson" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "addressLine1" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zip" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "personId" TEXT,
    "notes" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "donors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "donations" (
    "id" TEXT NOT NULL,
    "bloomerangId" TEXT,
    "donorId" TEXT NOT NULL,
    "donationDate" DATE NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "paymentMethod" TEXT,
    "fund" TEXT,
    "isRecurring" BOOLEAN NOT NULL DEFAULT false,
    "receiptSent" BOOLEAN NOT NULL DEFAULT false,
    "campaignId" TEXT,
    "eventId" TEXT,
    "notes" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "donations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaigns" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "startDate" DATE,
    "endDate" DATE,
    "goalAmount" DECIMAL(12,2),
    "status" TEXT NOT NULL DEFAULT 'active',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "eventType" TEXT,
    "eventDate" DATE NOT NULL,
    "location" TEXT,
    "campaignId" TEXT,
    "description" TEXT,
    "attendanceCount" INTEGER,
    "revenue" DECIMAL(12,2),
    "expenses" DECIMAL(12,2),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_registrations" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "personId" TEXT,
    "externalName" TEXT,
    "externalEmail" TEXT,
    "status" TEXT NOT NULL DEFAULT 'registered',
    "checkedInAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "event_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendors" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactPerson" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "addressLine1" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zip" TEXT,
    "servicesProvided" TEXT,
    "isReferralPartner" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "vendors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactPerson" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "addressLine1" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zip" TEXT,
    "industry" TEXT,
    "hiringStatus" "HiringStatus" NOT NULL DEFAULT 'prospect',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "employers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "participant_employments" (
    "id" TEXT NOT NULL,
    "participantProfileId" TEXT NOT NULL,
    "employerId" TEXT NOT NULL,
    "jobTitle" TEXT NOT NULL,
    "startDate" DATE,
    "endDate" DATE,
    "status" "EmploymentStatus" NOT NULL DEFAULT 'applied',
    "payRate" DECIMAL(10,2),
    "payPeriod" TEXT DEFAULT 'hourly',
    "hoursPerWeek" INTEGER,
    "supervisorName" TEXT,
    "supervisorPhone" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "participant_employments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employment_status_history" (
    "id" TEXT NOT NULL,
    "employmentId" TEXT NOT NULL,
    "fromStatus" "EmploymentStatus",
    "toStatus" "EmploymentStatus" NOT NULL,
    "effectiveDate" DATE NOT NULL,
    "changedById" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employment_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicles" (
    "id" TEXT NOT NULL,
    "make" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "color" TEXT,
    "licensePlate" TEXT,
    "vin" TEXT,
    "mileage" INTEGER,
    "assignedLocation" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "insuranceExpiration" DATE,
    "registrationExpiration" DATE,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_maintenance_records" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "maintenanceDate" DATE NOT NULL,
    "maintenanceType" TEXT NOT NULL,
    "mileageAtService" INTEGER,
    "vendorId" TEXT,
    "cost" DECIMAL(10,2),
    "description" TEXT,
    "nextServiceDueDate" DATE,
    "nextServiceDueMileage" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "vehicle_maintenance_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "communication_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel" "CommChannel" NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "communication_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "communication_batches" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel" "CommChannel" NOT NULL,
    "audienceFilter" JSONB,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "communication_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "communications" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "channel" "CommChannel" NOT NULL,
    "templateId" TEXT,
    "batchId" TEXT,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "status" "CommStatus" NOT NULL DEFAULT 'queued',
    "statusDetail" TEXT,
    "relatedEntityType" TEXT,
    "relatedEntityId" TEXT,
    "sentById" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "communications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "volunteer_applications" (
    "id" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "city" TEXT,
    "state" TEXT,
    "interestAreas" TEXT[],
    "availability" TEXT,
    "churchAffiliation" TEXT,
    "message" TEXT,
    "consentAt" TIMESTAMP(3),
    "status" "IntakeStatus" NOT NULL DEFAULT 'pending',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNotes" TEXT,
    "linkedPersonId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "volunteer_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referrals_inbox" (
    "id" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "referrerType" "ReferrerType" NOT NULL,
    "referrerName" TEXT,
    "referrerPhone" TEXT,
    "referrerEmail" TEXT,
    "subjectFirstName" TEXT NOT NULL,
    "subjectLastName" TEXT NOT NULL,
    "subjectPhone" TEXT,
    "facilityName" TEXT,
    "state" TEXT,
    "expectedReleaseDate" DATE,
    "needs" TEXT NOT NULL,
    "status" "IntakeStatus" NOT NULL DEFAULT 'pending',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNotes" TEXT,
    "linkedParticipantProfileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "referrals_inbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alumni_form_tokens" (
    "id" TEXT NOT NULL,
    "participantProfileId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alumni_form_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alumni_updates" (
    "id" TEXT NOT NULL,
    "participantProfileId" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "employmentStatus" TEXT,
    "housingStatus" TEXT,
    "newPhone" TEXT,
    "newEmail" TEXT,
    "newAddress" TEXT,
    "message" TEXT,
    "status" "IntakeStatus" NOT NULL DEFAULT 'pending',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alumni_updates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_sharing_agreements" (
    "id" TEXT NOT NULL,
    "stateOrAgency" TEXT NOT NULL,
    "effectiveDate" DATE NOT NULL,
    "expiryDate" DATE,
    "permittedUses" TEXT,
    "reDisclosureRestrictions" TEXT,
    "requiredSafeguards" TEXT,
    "purgeOnTermination" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "data_sharing_agreements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachments" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "fileKey" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "contentType" TEXT,
    "sizeBytes" INTEGER,
    "sensitivity" "AttachmentSensitivity" NOT NULL DEFAULT 'standard',
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" "AuditAction" NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "oldValues" JSONB,
    "newValues" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "sync_runs" (
    "id" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'running',
    "stats" JSONB,
    "error" TEXT,

    CONSTRAINT "sync_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "persons_lastName_firstName_idx" ON "persons"("lastName", "firstName");

-- CreateIndex
CREATE INDEX "persons_primaryEmail_idx" ON "persons"("primaryEmail");

-- CreateIndex
CREATE INDEX "persons_primaryPhone_idx" ON "persons"("primaryPhone");

-- CreateIndex
CREATE INDEX "person_addresses_personId_idx" ON "person_addresses"("personId");

-- CreateIndex
CREATE INDEX "person_contacts_personId_idx" ON "person_contacts"("personId");

-- CreateIndex
CREATE INDEX "testimony_consents_personId_idx" ON "testimony_consents"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "participant_profiles_personId_key" ON "participant_profiles"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "participant_profiles_participantNumber_key" ON "participant_profiles"("participantNumber");

-- CreateIndex
CREATE INDEX "participant_profiles_assignedCaseManagerId_idx" ON "participant_profiles"("assignedCaseManagerId");

-- CreateIndex
CREATE INDEX "participant_profiles_insideStatus_idx" ON "participant_profiles"("insideStatus");

-- CreateIndex
CREATE INDEX "participant_profiles_outsideStatus_idx" ON "participant_profiles"("outsideStatus");

-- CreateIndex
CREATE INDEX "participant_profiles_alumniStatus_idx" ON "participant_profiles"("alumniStatus");

-- CreateIndex
CREATE INDEX "participant_doc_ids_docNumber_idx" ON "participant_doc_ids"("docNumber");

-- CreateIndex
CREATE UNIQUE INDEX "participant_doc_ids_participantProfileId_state_docNumber_key" ON "participant_doc_ids"("participantProfileId", "state", "docNumber");

-- CreateIndex
CREATE INDEX "participant_status_history_participantProfileId_effectiveDa_idx" ON "participant_status_history"("participantProfileId", "effectiveDate");

-- CreateIndex
CREATE UNIQUE INDEX "volunteer_profiles_personId_key" ON "volunteer_profiles"("personId");

-- CreateIndex
CREATE INDEX "volunteer_profiles_status_idx" ON "volunteer_profiles"("status");

-- CreateIndex
CREATE INDEX "volunteer_profiles_isMentor_idx" ON "volunteer_profiles"("isMentor");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_personId_key" ON "users"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "roles_key_key" ON "roles"("key");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_key_key" ON "permissions"("key");

-- CreateIndex
CREATE UNIQUE INDEX "role_permissions_roleId_permissionId_key" ON "role_permissions"("roleId", "permissionId");

-- CreateIndex
CREATE UNIQUE INDEX "user_roles_userId_roleId_key" ON "user_roles"("userId", "roleId");

-- CreateIndex
CREATE UNIQUE INDEX "user_region_scopes_userId_state_key" ON "user_region_scopes"("userId", "state");

-- CreateIndex
CREATE INDEX "session_expire_idx" ON "session"("expire");

-- CreateIndex
CREATE INDEX "institutions_state_idx" ON "institutions"("state");

-- CreateIndex
CREATE INDEX "institutions_active_idx" ON "institutions"("active");

-- CreateIndex
CREATE INDEX "inside_classes_institutionId_idx" ON "inside_classes"("institutionId");

-- CreateIndex
CREATE INDEX "inside_classes_status_idx" ON "inside_classes"("status");

-- CreateIndex
CREATE INDEX "inside_class_enrollments_insideClassId_idx" ON "inside_class_enrollments"("insideClassId");

-- CreateIndex
CREATE INDEX "inside_class_enrollments_completionStatus_idx" ON "inside_class_enrollments"("completionStatus");

-- CreateIndex
CREATE UNIQUE INDEX "inside_class_enrollments_participantProfileId_insideClassId_key" ON "inside_class_enrollments"("participantProfileId", "insideClassId");

-- CreateIndex
CREATE INDEX "inside_class_sessions_insideClassId_sessionDate_idx" ON "inside_class_sessions"("insideClassId", "sessionDate");

-- CreateIndex
CREATE UNIQUE INDEX "inside_class_session_attendance_sessionId_enrollmentId_key" ON "inside_class_session_attendance"("sessionId", "enrollmentId");

-- CreateIndex
CREATE INDEX "outside_programs_programType_idx" ON "outside_programs"("programType");

-- CreateIndex
CREATE INDEX "outside_programs_status_idx" ON "outside_programs"("status");

-- CreateIndex
CREATE INDEX "outside_programs_state_idx" ON "outside_programs"("state");

-- CreateIndex
CREATE INDEX "outside_program_enrollments_participantProfileId_idx" ON "outside_program_enrollments"("participantProfileId");

-- CreateIndex
CREATE INDEX "outside_program_enrollments_outsideProgramId_idx" ON "outside_program_enrollments"("outsideProgramId");

-- CreateIndex
CREATE INDEX "outside_program_enrollments_status_idx" ON "outside_program_enrollments"("status");

-- CreateIndex
CREATE INDEX "outside_program_sessions_outsideProgramId_sessionDate_idx" ON "outside_program_sessions"("outsideProgramId", "sessionDate");

-- CreateIndex
CREATE UNIQUE INDEX "outside_program_session_attendance_sessionId_enrollmentId_key" ON "outside_program_session_attendance"("sessionId", "enrollmentId");

-- CreateIndex
CREATE INDEX "transitional_homes_state_idx" ON "transitional_homes"("state");

-- CreateIndex
CREATE INDEX "transitional_homes_active_idx" ON "transitional_homes"("active");

-- CreateIndex
CREATE INDEX "housing_enrollments_participantProfileId_idx" ON "housing_enrollments"("participantProfileId");

-- CreateIndex
CREATE INDEX "housing_enrollments_homeId_idx" ON "housing_enrollments"("homeId");

-- CreateIndex
CREATE INDEX "housing_enrollments_status_idx" ON "housing_enrollments"("status");

-- CreateIndex
CREATE INDEX "onboarding_checklist_template_items_templateId_idx" ON "onboarding_checklist_template_items"("templateId");

-- CreateIndex
CREATE INDEX "onboarding_checklists_participantProfileId_idx" ON "onboarding_checklists"("participantProfileId");

-- CreateIndex
CREATE INDEX "onboarding_checklist_items_checklistId_idx" ON "onboarding_checklist_items"("checklistId");

-- CreateIndex
CREATE INDEX "case_notes_participantProfileId_noteDate_idx" ON "case_notes"("participantProfileId", "noteDate");

-- CreateIndex
CREATE INDEX "case_notes_caseManagerId_idx" ON "case_notes"("caseManagerId");

-- CreateIndex
CREATE INDEX "case_notes_followUpRequired_followUpDate_idx" ON "case_notes"("followUpRequired", "followUpDate");

-- CreateIndex
CREATE INDEX "case_services_participantProfileId_serviceDate_idx" ON "case_services"("participantProfileId", "serviceDate");

-- CreateIndex
CREATE INDEX "service_plans_participantProfileId_idx" ON "service_plans"("participantProfileId");

-- CreateIndex
CREATE INDEX "goals_servicePlanId_idx" ON "goals"("servicePlanId");

-- CreateIndex
CREATE INDEX "goal_milestones_goalId_idx" ON "goal_milestones"("goalId");

-- CreateIndex
CREATE INDEX "case_tasks_assignedToId_status_dueDate_idx" ON "case_tasks"("assignedToId", "status", "dueDate");

-- CreateIndex
CREATE INDEX "case_tasks_participantProfileId_idx" ON "case_tasks"("participantProfileId");

-- CreateIndex
CREATE INDEX "outbound_referrals_participantProfileId_idx" ON "outbound_referrals"("participantProfileId");

-- CreateIndex
CREATE INDEX "needs_assessments_participantProfileId_administeredAt_idx" ON "needs_assessments"("participantProfileId", "administeredAt");

-- CreateIndex
CREATE INDEX "volunteer_assignments_volunteerProfileId_idx" ON "volunteer_assignments"("volunteerProfileId");

-- CreateIndex
CREATE INDEX "volunteer_assignments_institutionId_idx" ON "volunteer_assignments"("institutionId");

-- CreateIndex
CREATE INDEX "volunteer_assignments_outsideProgramId_idx" ON "volunteer_assignments"("outsideProgramId");

-- CreateIndex
CREATE INDEX "volunteer_assignments_status_idx" ON "volunteer_assignments"("status");

-- CreateIndex
CREATE INDEX "background_checks_personId_idx" ON "background_checks"("personId");

-- CreateIndex
CREATE INDEX "background_checks_expiresAt_idx" ON "background_checks"("expiresAt");

-- CreateIndex
CREATE INDEX "volunteer_trainings_volunteerProfileId_idx" ON "volunteer_trainings"("volunteerProfileId");

-- CreateIndex
CREATE INDEX "volunteer_trainings_expiresAt_idx" ON "volunteer_trainings"("expiresAt");

-- CreateIndex
CREATE INDEX "facility_clearance_requirements_institutionId_idx" ON "facility_clearance_requirements"("institutionId");

-- CreateIndex
CREATE INDEX "volunteer_clearances_expiresAt_idx" ON "volunteer_clearances"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "volunteer_clearances_volunteerProfileId_requirementId_key" ON "volunteer_clearances"("volunteerProfileId", "requirementId");

-- CreateIndex
CREATE INDEX "alumni_engagements_participantProfileId_engagementDate_idx" ON "alumni_engagements"("participantProfileId", "engagementDate");

-- CreateIndex
CREATE INDEX "outcome_checkins_dueDate_completedDate_idx" ON "outcome_checkins"("dueDate", "completedDate");

-- CreateIndex
CREATE UNIQUE INDEX "outcome_checkins_participantProfileId_wave_key" ON "outcome_checkins"("participantProfileId", "wave");

-- CreateIndex
CREATE INDEX "mentor_screening_template_items_templateId_idx" ON "mentor_screening_template_items"("templateId");

-- CreateIndex
CREATE INDEX "mentor_screenings_volunteerProfileId_idx" ON "mentor_screenings"("volunteerProfileId");

-- CreateIndex
CREATE INDEX "mentor_screenings_stage_idx" ON "mentor_screenings"("stage");

-- CreateIndex
CREATE INDEX "mentor_screening_criteria_screeningId_idx" ON "mentor_screening_criteria"("screeningId");

-- CreateIndex
CREATE INDEX "mentor_screening_steps_screeningId_idx" ON "mentor_screening_steps"("screeningId");

-- CreateIndex
CREATE INDEX "mentor_assignments_mentorProfileId_idx" ON "mentor_assignments"("mentorProfileId");

-- CreateIndex
CREATE INDEX "mentor_assignments_participantProfileId_idx" ON "mentor_assignments"("participantProfileId");

-- CreateIndex
CREATE INDEX "mentor_assignments_status_idx" ON "mentor_assignments"("status");

-- CreateIndex
CREATE INDEX "mentor_session_logs_mentorAssignmentId_sessionDate_idx" ON "mentor_session_logs"("mentorAssignmentId", "sessionDate");

-- CreateIndex
CREATE UNIQUE INDEX "donors_bloomerangId_key" ON "donors"("bloomerangId");

-- CreateIndex
CREATE INDEX "donors_name_idx" ON "donors"("name");

-- CreateIndex
CREATE INDEX "donors_personId_idx" ON "donors"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "donations_bloomerangId_key" ON "donations"("bloomerangId");

-- CreateIndex
CREATE INDEX "donations_donorId_idx" ON "donations"("donorId");

-- CreateIndex
CREATE INDEX "donations_donationDate_idx" ON "donations"("donationDate");

-- CreateIndex
CREATE INDEX "donations_campaignId_idx" ON "donations"("campaignId");

-- CreateIndex
CREATE INDEX "donations_eventId_idx" ON "donations"("eventId");

-- CreateIndex
CREATE INDEX "campaigns_status_idx" ON "campaigns"("status");

-- CreateIndex
CREATE INDEX "events_eventDate_idx" ON "events"("eventDate");

-- CreateIndex
CREATE INDEX "events_campaignId_idx" ON "events"("campaignId");

-- CreateIndex
CREATE INDEX "event_registrations_eventId_idx" ON "event_registrations"("eventId");

-- CreateIndex
CREATE INDEX "event_registrations_personId_idx" ON "event_registrations"("personId");

-- CreateIndex
CREATE INDEX "vendors_name_idx" ON "vendors"("name");

-- CreateIndex
CREATE INDEX "employers_hiringStatus_idx" ON "employers"("hiringStatus");

-- CreateIndex
CREATE INDEX "employers_state_idx" ON "employers"("state");

-- CreateIndex
CREATE INDEX "participant_employments_participantProfileId_idx" ON "participant_employments"("participantProfileId");

-- CreateIndex
CREATE INDEX "participant_employments_employerId_idx" ON "participant_employments"("employerId");

-- CreateIndex
CREATE INDEX "participant_employments_status_idx" ON "participant_employments"("status");

-- CreateIndex
CREATE INDEX "employment_status_history_employmentId_idx" ON "employment_status_history"("employmentId");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_vin_key" ON "vehicles"("vin");

-- CreateIndex
CREATE INDEX "vehicles_active_idx" ON "vehicles"("active");

-- CreateIndex
CREATE INDEX "vehicle_maintenance_records_vehicleId_maintenanceDate_idx" ON "vehicle_maintenance_records"("vehicleId", "maintenanceDate");

-- CreateIndex
CREATE INDEX "vehicle_maintenance_records_nextServiceDueDate_idx" ON "vehicle_maintenance_records"("nextServiceDueDate");

-- CreateIndex
CREATE INDEX "communications_personId_createdAt_idx" ON "communications"("personId", "createdAt");

-- CreateIndex
CREATE INDEX "communications_status_idx" ON "communications"("status");

-- CreateIndex
CREATE INDEX "communications_batchId_idx" ON "communications"("batchId");

-- CreateIndex
CREATE INDEX "volunteer_applications_status_submittedAt_idx" ON "volunteer_applications"("status", "submittedAt");

-- CreateIndex
CREATE INDEX "referrals_inbox_status_submittedAt_idx" ON "referrals_inbox"("status", "submittedAt");

-- CreateIndex
CREATE UNIQUE INDEX "alumni_form_tokens_token_key" ON "alumni_form_tokens"("token");

-- CreateIndex
CREATE INDEX "alumni_form_tokens_participantProfileId_idx" ON "alumni_form_tokens"("participantProfileId");

-- CreateIndex
CREATE INDEX "alumni_updates_status_idx" ON "alumni_updates"("status");

-- CreateIndex
CREATE INDEX "attachments_entityType_entityId_idx" ON "attachments"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_userId_createdAt_idx" ON "audit_logs"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_action_createdAt_idx" ON "audit_logs"("action", "createdAt");

-- CreateIndex
CREATE INDEX "sync_runs_target_startedAt_idx" ON "sync_runs"("target", "startedAt");

-- AddForeignKey
ALTER TABLE "person_addresses" ADD CONSTRAINT "person_addresses_personId_fkey" FOREIGN KEY ("personId") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_contacts" ADD CONSTRAINT "person_contacts_personId_fkey" FOREIGN KEY ("personId") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "testimony_consents" ADD CONSTRAINT "testimony_consents_personId_fkey" FOREIGN KEY ("personId") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participant_profiles" ADD CONSTRAINT "participant_profiles_personId_fkey" FOREIGN KEY ("personId") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participant_profiles" ADD CONSTRAINT "participant_profiles_assignedCaseManagerId_fkey" FOREIGN KEY ("assignedCaseManagerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participant_doc_ids" ADD CONSTRAINT "participant_doc_ids_participantProfileId_fkey" FOREIGN KEY ("participantProfileId") REFERENCES "participant_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participant_doc_ids" ADD CONSTRAINT "participant_doc_ids_dataSharingAgreementId_fkey" FOREIGN KEY ("dataSharingAgreementId") REFERENCES "data_sharing_agreements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participant_status_history" ADD CONSTRAINT "participant_status_history_participantProfileId_fkey" FOREIGN KEY ("participantProfileId") REFERENCES "participant_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "volunteer_profiles" ADD CONSTRAINT "volunteer_profiles_personId_fkey" FOREIGN KEY ("personId") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_personId_fkey" FOREIGN KEY ("personId") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_region_scopes" ADD CONSTRAINT "user_region_scopes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inside_classes" ADD CONSTRAINT "inside_classes_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inside_classes" ADD CONSTRAINT "inside_classes_staffLeadId_fkey" FOREIGN KEY ("staffLeadId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inside_class_enrollments" ADD CONSTRAINT "inside_class_enrollments_participantProfileId_fkey" FOREIGN KEY ("participantProfileId") REFERENCES "participant_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inside_class_enrollments" ADD CONSTRAINT "inside_class_enrollments_insideClassId_fkey" FOREIGN KEY ("insideClassId") REFERENCES "inside_classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inside_class_sessions" ADD CONSTRAINT "inside_class_sessions_insideClassId_fkey" FOREIGN KEY ("insideClassId") REFERENCES "inside_classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inside_class_session_attendance" ADD CONSTRAINT "inside_class_session_attendance_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "inside_class_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inside_class_session_attendance" ADD CONSTRAINT "inside_class_session_attendance_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "inside_class_enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outside_programs" ADD CONSTRAINT "outside_programs_staffLeadId_fkey" FOREIGN KEY ("staffLeadId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outside_program_enrollments" ADD CONSTRAINT "outside_program_enrollments_participantProfileId_fkey" FOREIGN KEY ("participantProfileId") REFERENCES "participant_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outside_program_enrollments" ADD CONSTRAINT "outside_program_enrollments_outsideProgramId_fkey" FOREIGN KEY ("outsideProgramId") REFERENCES "outside_programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outside_program_sessions" ADD CONSTRAINT "outside_program_sessions_outsideProgramId_fkey" FOREIGN KEY ("outsideProgramId") REFERENCES "outside_programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outside_program_session_attendance" ADD CONSTRAINT "outside_program_session_attendance_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "outside_program_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outside_program_session_attendance" ADD CONSTRAINT "outside_program_session_attendance_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "outside_program_enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "housing_enrollments" ADD CONSTRAINT "housing_enrollments_participantProfileId_fkey" FOREIGN KEY ("participantProfileId") REFERENCES "participant_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "housing_enrollments" ADD CONSTRAINT "housing_enrollments_homeId_fkey" FOREIGN KEY ("homeId") REFERENCES "transitional_homes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "housing_enrollments" ADD CONSTRAINT "housing_enrollments_outsideProgramEnrollmentId_fkey" FOREIGN KEY ("outsideProgramEnrollmentId") REFERENCES "outside_program_enrollments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_checklist_template_items" ADD CONSTRAINT "onboarding_checklist_template_items_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "onboarding_checklist_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_checklists" ADD CONSTRAINT "onboarding_checklists_participantProfileId_fkey" FOREIGN KEY ("participantProfileId") REFERENCES "participant_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_checklists" ADD CONSTRAINT "onboarding_checklists_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "onboarding_checklist_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_checklist_items" ADD CONSTRAINT "onboarding_checklist_items_checklistId_fkey" FOREIGN KEY ("checklistId") REFERENCES "onboarding_checklists"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_notes" ADD CONSTRAINT "case_notes_participantProfileId_fkey" FOREIGN KEY ("participantProfileId") REFERENCES "participant_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_notes" ADD CONSTRAINT "case_notes_caseManagerId_fkey" FOREIGN KEY ("caseManagerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_services" ADD CONSTRAINT "case_services_participantProfileId_fkey" FOREIGN KEY ("participantProfileId") REFERENCES "participant_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_plans" ADD CONSTRAINT "service_plans_participantProfileId_fkey" FOREIGN KEY ("participantProfileId") REFERENCES "participant_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goals" ADD CONSTRAINT "goals_servicePlanId_fkey" FOREIGN KEY ("servicePlanId") REFERENCES "service_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goal_milestones" ADD CONSTRAINT "goal_milestones_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "goals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_tasks" ADD CONSTRAINT "case_tasks_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_tasks" ADD CONSTRAINT "case_tasks_participantProfileId_fkey" FOREIGN KEY ("participantProfileId") REFERENCES "participant_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_tasks" ADD CONSTRAINT "case_tasks_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "goals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_tasks" ADD CONSTRAINT "case_tasks_outboundReferralId_fkey" FOREIGN KEY ("outboundReferralId") REFERENCES "outbound_referrals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbound_referrals" ADD CONSTRAINT "outbound_referrals_participantProfileId_fkey" FOREIGN KEY ("participantProfileId") REFERENCES "participant_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbound_referrals" ADD CONSTRAINT "outbound_referrals_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "needs_assessments" ADD CONSTRAINT "needs_assessments_participantProfileId_fkey" FOREIGN KEY ("participantProfileId") REFERENCES "participant_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "volunteer_assignments" ADD CONSTRAINT "volunteer_assignments_volunteerProfileId_fkey" FOREIGN KEY ("volunteerProfileId") REFERENCES "volunteer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "volunteer_assignments" ADD CONSTRAINT "volunteer_assignments_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "volunteer_assignments" ADD CONSTRAINT "volunteer_assignments_insideClassId_fkey" FOREIGN KEY ("insideClassId") REFERENCES "inside_classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "volunteer_assignments" ADD CONSTRAINT "volunteer_assignments_outsideProgramId_fkey" FOREIGN KEY ("outsideProgramId") REFERENCES "outside_programs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "volunteer_assignments" ADD CONSTRAINT "volunteer_assignments_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "background_checks" ADD CONSTRAINT "background_checks_personId_fkey" FOREIGN KEY ("personId") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "volunteer_trainings" ADD CONSTRAINT "volunteer_trainings_volunteerProfileId_fkey" FOREIGN KEY ("volunteerProfileId") REFERENCES "volunteer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facility_clearance_requirements" ADD CONSTRAINT "facility_clearance_requirements_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "volunteer_clearances" ADD CONSTRAINT "volunteer_clearances_volunteerProfileId_fkey" FOREIGN KEY ("volunteerProfileId") REFERENCES "volunteer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "volunteer_clearances" ADD CONSTRAINT "volunteer_clearances_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "facility_clearance_requirements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alumni_engagements" ADD CONSTRAINT "alumni_engagements_participantProfileId_fkey" FOREIGN KEY ("participantProfileId") REFERENCES "participant_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outcome_checkins" ADD CONSTRAINT "outcome_checkins_participantProfileId_fkey" FOREIGN KEY ("participantProfileId") REFERENCES "participant_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mentor_screening_template_items" ADD CONSTRAINT "mentor_screening_template_items_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "mentor_screening_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mentor_screenings" ADD CONSTRAINT "mentor_screenings_volunteerProfileId_fkey" FOREIGN KEY ("volunteerProfileId") REFERENCES "volunteer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mentor_screenings" ADD CONSTRAINT "mentor_screenings_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "mentor_screening_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mentor_screening_criteria" ADD CONSTRAINT "mentor_screening_criteria_screeningId_fkey" FOREIGN KEY ("screeningId") REFERENCES "mentor_screenings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mentor_screening_steps" ADD CONSTRAINT "mentor_screening_steps_screeningId_fkey" FOREIGN KEY ("screeningId") REFERENCES "mentor_screenings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mentor_assignments" ADD CONSTRAINT "mentor_assignments_mentorProfileId_fkey" FOREIGN KEY ("mentorProfileId") REFERENCES "volunteer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mentor_assignments" ADD CONSTRAINT "mentor_assignments_participantProfileId_fkey" FOREIGN KEY ("participantProfileId") REFERENCES "participant_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mentor_session_logs" ADD CONSTRAINT "mentor_session_logs_mentorAssignmentId_fkey" FOREIGN KEY ("mentorAssignmentId") REFERENCES "mentor_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "donors" ADD CONSTRAINT "donors_personId_fkey" FOREIGN KEY ("personId") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "donations" ADD CONSTRAINT "donations_donorId_fkey" FOREIGN KEY ("donorId") REFERENCES "donors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "donations" ADD CONSTRAINT "donations_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "donations" ADD CONSTRAINT "donations_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_personId_fkey" FOREIGN KEY ("personId") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participant_employments" ADD CONSTRAINT "participant_employments_participantProfileId_fkey" FOREIGN KEY ("participantProfileId") REFERENCES "participant_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participant_employments" ADD CONSTRAINT "participant_employments_employerId_fkey" FOREIGN KEY ("employerId") REFERENCES "employers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employment_status_history" ADD CONSTRAINT "employment_status_history_employmentId_fkey" FOREIGN KEY ("employmentId") REFERENCES "participant_employments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_maintenance_records" ADD CONSTRAINT "vehicle_maintenance_records_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_maintenance_records" ADD CONSTRAINT "vehicle_maintenance_records_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communications" ADD CONSTRAINT "communications_personId_fkey" FOREIGN KEY ("personId") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communications" ADD CONSTRAINT "communications_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "communication_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communications" ADD CONSTRAINT "communications_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "communication_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "volunteer_applications" ADD CONSTRAINT "volunteer_applications_linkedPersonId_fkey" FOREIGN KEY ("linkedPersonId") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals_inbox" ADD CONSTRAINT "referrals_inbox_linkedParticipantProfileId_fkey" FOREIGN KEY ("linkedParticipantProfileId") REFERENCES "participant_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alumni_form_tokens" ADD CONSTRAINT "alumni_form_tokens_participantProfileId_fkey" FOREIGN KEY ("participantProfileId") REFERENCES "participant_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alumni_updates" ADD CONSTRAINT "alumni_updates_participantProfileId_fkey" FOREIGN KEY ("participantProfileId") REFERENCES "participant_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
