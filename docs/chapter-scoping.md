# Chapter scoping (§7.2) — full enforcement design

Every operational record belongs to **exactly one chapter** (`FL, GA, NC, OH, SC, TX, USA` —
`CHAPTER_STATES` in `packages/shared/src/chapters.ts`).

**USA is the national office, and it is a PEER of the state chapters, not a parent.** National
staff hold their own Development records and are isolated from every state chapter's, exactly
as the states are isolated from one another. It confers no cross-chapter visibility: a
USA-scoped user sees USA rows and nothing else. Two consequences worth stating plainly, because
both are tempting shortcuts:

* **`USA` is not a synonym for all-chapters.** All-chapters is still the ABSENCE of a scope row.
  Treating USA as "sees everything" would hand national staff every chapter's donor file.
* **Nationwide reporting does not exist yet.** Rule 4 forces `user.chapter` into every report
  query, so a USA-scoped user's reports cover USA only. Aggregate national statistics — totals
  across chapters without exposing another chapter's Development records — is a separate
  capability, deliberately not built. Do not approximate it by widening USA's scope.

**`PUBLIC_INTAKE_STATES` excludes USA.** The public referral and volunteer-application forms ask
which chapter should receive the submission; those queues are worked by state chapter staff, so
a submission routed to the national office would sit where nobody looks. The two lists diverge
in one direction only — every public option is a chapter, but not every chapter is a public
option (`national-chapter.spec.ts` pins this). A user is scoped to one chapter via
`user_region_scopes`, or to **all chapters** when they have no scope row. Administrators are
**always** all-chapters, regardless of scope rows (enforced in `SessionAuthGuard` and by
rejecting scope assignment to admins).

## The four rules

1. **One chapter per record.** Chapter-bearing columns are required (`NOT NULL`) wherever the
   record is staff-created. Public-intake rows (`VolunteerApplication`, `ReferralInboxItem`)
   keep a nullable `state` for legacy rows; the public forms now require a chapter state, and
   staff must pick a chapter at review time for legacy null rows.
2. **Creates are stamped from the creator.** A chapter-scoped user's records always get their
   chapter (a mismatching explicit value is a 403). An all-chapters user (admin or unscoped)
   must select the chapter explicitly (400 otherwise). Implemented once in
   `resolveCreateChapter()` (`apps/api/src/common/chapter.util.ts`) and used by every
   own-column create. Child records inherit chapter through their required parent, so their
   creates instead assert the parent's chapter.
3. **Admins and all-chapters users see everything.** `user.chapter === null` means all
   chapters; every list filter and `assertChapterAccess` call passes. Admin accounts cannot be
   chapter-scoped (guard ignores scope rows for actual admins; `PUT region-scopes` rejects
   admins; granting the admin role clears existing scopes).
4. **Reports and dashboards are shared, results filtered.** The report catalog is
   permission-filtered only; every report/widget query consumes the forced `state` param
   (`user.chapter ?? requested`). The view-as chapter preview flows through `user.chapter`.

## Where each entity's chapter lives

| Entity | Chapter source | Notes |
|---|---|---|
| Institution | own `state` (required) | facility state = chapter |
| InstitutionContact, InsideClass (+enrollment/session/attendance), FacilityClearanceRequirement, ParticipantInsideLocation | via `institution.state` | |
| TransitionalHome | own `state` (required) | |
| HousingEnrollment | via `home.state` | transfers assert both homes |
| OutsideProgram (+enrollment/session/attendance) | own `state` (now required) | |
| **ParticipantProfile** | **new `chapterState` (required)** | `Person.state` is a mailing address again — NOT a chapter |
| Case management (CaseNote, CaseService, ServicePlan, Goal, GoalMilestone, OutboundReferral, NeedsAssessment, OnboardingChecklist, DrugTest, BudgetItem/Payment, TravelRequest, IncidentReport, Portal*/Meeting/Transport requests, ParticipantStatusHistory) | via `participantProfile.chapterState` | CaseTask with no participant/goal/referral parent is chapter-neutral (staff to-do) |
| **VolunteerProfile** | **new `chapterState` (required)** | |
| Volunteer children (Assignment, Training, Clearance, HoursEntry, ShiftSignup) | via `volunteerProfile.chapterState` | signup also asserts shift's opportunity chapter |
| BackgroundCheck | via `person.volunteerProfile.chapterState` | chapter-neutral if the person has no volunteer profile |
| VolunteerOpportunity (+Shift) | own `state` (now required) | shifts via `opportunity.state` |
| Alumni & mentoring (AlumniEngagement, OutcomeCheckin, AlumniUpdate, AlumniFormToken) | via `participantProfile.chapterState` | |
| MentorScreening (+criteria/steps) | via `volunteerProfile.chapterState` | |
| MentorAssignment (+MentorSessionLog) | via mentee `participantProfile.chapterState` | create rejects mentor/mentee chapter mismatch (400) for everyone |
| Intake queues (VolunteerApplication, ReferralInboxItem) | own `state` (nullable, public-form sourced) | public schemas now require a CHAPTER_STATE; legacy null rows visible to all-chapters staff only, review of a null-state item requires an explicit chapter |
| **Donor** | **new `chapterState` (required)** | `Donor.state` stays postal address |
| CRM children (Donation, Pledge, RecurringGift, SoftCredit, DonorInteraction, DonorTask, DonorRelationship) | via `donor.chapterState` | linked campaign/event/appeal must match the donor's chapter |
| **Household** | **new `chapterState` (required)** | addMember asserts the donor's chapter matches |
| **Campaign** | **new `chapterState` (required)** | |
| Appeal | via `campaign.chapterState` when linked; org-global standalone | |
| Fund | org-global (accounting designation) | scoped viewers' rollups filter by donor chapter |
| **Event** (+EventRegistration) | **new `chapterState` (required)** | registrations via event |
| **Vendor** | **new `chapterState` (required)** | `Vendor.state` stays postal |
| **Employer** | **new `chapterState` (required)** | `Employer.state` stays postal; module previously used `state` as chapter — migrated |
| ParticipantEmployment (+EmploymentStatusHistory) | via `participantProfile.chapterState` | employer chapter also asserted at link time |
| **Vehicle** (+VehicleMaintenanceRecord) | **new `chapterState` (required)** | |
| **CommunicationBatch** | **new `chapterState` (required)** | audience filter is forced to the batch chapter |
| **Communication** | **new `chapterState` (required)** | stamped at send: `user.chapter ?? recipient chapter` |
| CommunicationTemplate, OnboardingChecklistTemplate, MentorScreeningTemplate | org-global by design | shared content/config, no PII |
| Users, roles, support tickets, app settings, audit log | org-global (admin surfaces) | |

Entities whose own `state` IS their chapter (Institution, TransitionalHome, OutsideProgram,
VolunteerOpportunity) type that column as `ChapterState`, not `UsState`. Three list filters were
typed `UsState` and accepted all 50 — meaningless for the 44 that are not chapters, and a type
error the moment USA joined the list, since USA is not a postal state. That mismatch is now
impossible to reintroduce silently: the compiler rejects it.

## Cross-chapter dedupe

Duplicate-candidate searches (`participants duplicate-check`, donor person-matching, intake
duplicate candidates) are **chapter-filtered for scoped users** — they could not act on a
cross-chapter match anyway — and stay global for all-chapters users, who do the cross-chapter
merging.

## Migration & backfill

One migration (`chapter_scoping_all_entities`) adds the new columns nullable, backfills, then
sets `NOT NULL` + indexes. Backfill rules: profiles from `persons.state` when it is a chapter
state else `'SC'`; Donor from postal `state` when a chapter state else `'SC'`; Household from
its first member donor; Event from its campaign; Communication from its person's profile
chapter; everything else `'SC'`. `OutsideProgram.state` / `VolunteerOpportunity.state`
backfill nulls and become required. Employer/Vendor postal `state` columns are left untouched.
