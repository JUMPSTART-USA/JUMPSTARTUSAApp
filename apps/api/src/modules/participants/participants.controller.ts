import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ALUMNI_STATUSES,
  INSIDE_STATUSES,
  OUTSIDE_STATUSES,
  US_STATES,
  graduationSchema,
  listQuerySchema,
  optionalDate,
  optionalEmail,
  optionalPhone,
  participantCreateSchema,
  participantDocIdSchema,
  participantInsideLocationSchema,
  participantOffenseSchema,
  participantUpdateSchema,
  personAddressSchema,
  personContactSchema,
  releaseSchema,
  requiredTrimmed,
  testimonyConsentSchema,
  type GraduationInput,
  type ListQuery,
  type ParticipantCreateInput,
  type ParticipantDocIdInput,
  type ParticipantInsideLocationInput,
  type ParticipantOffenseInput,
  type ParticipantUpdateInput,
  type PersonAddressInput,
  type PersonContactInput,
  type ReleaseInput,
  type TestimonyConsentInput,
} from '@jumpstart/shared';
import { z } from 'zod';
import { CurrentUser, RequirePermission } from '../../common/decorators';
import { zodBody, zodQuery } from '../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../../common/types';
import { ParticipantSubresourcesService } from './participant-subresources.service';
import { ParticipantTimelineService } from './participant-timeline.service';
import { ParticipantsService } from './participants.service';

const listFiltersSchema = listQuerySchema.extend({
  insideStatus: z.enum(INSIDE_STATUSES).optional(),
  outsideStatus: z.enum(OUTSIDE_STATUSES).optional(),
  alumniStatus: z.enum(ALUMNI_STATUSES).optional(),
  state: z.enum(US_STATES).optional(),
  assignedCaseManagerId: z.string().uuid().optional(),
  /** Filter to participants whose ACTIVE inside location is this institution. */
  institutionId: z.string().uuid().optional(),
});
type ListFilters = z.infer<typeof listFiltersSchema>;

const duplicateCheckSchema = z.object({
  firstName: requiredTrimmed.pipe(z.string().max(100)),
  lastName: requiredTrimmed.pipe(z.string().max(100)),
  dateOfBirth: optionalDate,
  phone: optionalPhone,
  email: optionalEmail,
});
type DuplicateCheckBody = z.infer<typeof duplicateCheckSchema>;

@Controller('participants')
export class ParticipantsController {
  constructor(
    private readonly participants: ParticipantsService,
    private readonly timeline: ParticipantTimelineService,
    private readonly subresources: ParticipantSubresourcesService,
  ) {}

  @Get()
  @RequirePermission('participants.read')
  list(
    @Query(zodQuery(listFiltersSchema)) query: ListFilters,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const {
      insideStatus,
      outsideStatus,
      alumniStatus,
      state: requestedState,
      assignedCaseManagerId,
      institutionId,
      ...listQuery
    } = query;
    // Chapter scoping (§7.2): scoped users always see their own chapter.
    const state = (user.chapter ?? requestedState) as ListFilters['state'];
    return this.participants.list(listQuery as ListQuery, {
      insideStatus,
      outsideStatus,
      alumniStatus,
      state,
      assignedCaseManagerId,
      institutionId,
    });
  }

  /** §5: run before any person-creating flow to surface candidate matches. */
  @Post('duplicate-check')
  @RequirePermission('participants.create')
  duplicateCheck(@Body(zodBody(duplicateCheckSchema)) body: DuplicateCheckBody) {
    return this.participants.duplicateCheck(body);
  }

  @Post()
  @RequirePermission('participants.create')
  create(
    @Body(zodBody(participantCreateSchema)) body: ParticipantCreateInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.participants.create(body, user);
  }

  @Get(':id')
  @RequirePermission('participants.read')
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.participants.get(id, user);
  }

  @Patch(':id')
  @RequirePermission('participants.update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(participantUpdateSchema)) body: ParticipantUpdateInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.participants.update(id, body, user);
  }

  @Delete(':id')
  @RequirePermission('participants.delete')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.participants.softDelete(id, user);
  }

  @Get(':id/timeline')
  @RequirePermission('participants.read')
  getTimeline(
    @Param('id', ParseUUIDPipe) id: string,
    @Query(zodQuery(listQuerySchema)) query: ListQuery,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.timeline.timeline(id, { page: query.page, pageSize: query.pageSize }, user);
  }

  @Get(':id/status-history')
  @RequirePermission('participants.read')
  statusHistory(@Param('id', ParseUUIDPipe) id: string) {
    return this.participants.statusHistory(id);
  }

  @Post(':id/graduate')
  @RequirePermission('participants.update')
  graduate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(graduationSchema)) body: GraduationInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.participants.graduate(id, body, user);
  }

  // ── Contacts ──────────────────────────────────────────────────────────────

  @Get(':id/contacts')
  @RequirePermission('participants.read')
  listContacts(@Param('id', ParseUUIDPipe) id: string) {
    return this.subresources.listContacts(id);
  }

  @Post(':id/contacts')
  @RequirePermission('participants.update')
  createContact(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(personContactSchema)) body: PersonContactInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.subresources.createContact(id, body, user.id);
  }

  @Patch(':id/contacts/:contactId')
  @RequirePermission('participants.update')
  updateContact(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('contactId', ParseUUIDPipe) contactId: string,
    @Body(zodBody(personContactSchema)) body: PersonContactInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.subresources.updateContact(id, contactId, body, user.id);
  }

  @Delete(':id/contacts/:contactId')
  @RequirePermission('participants.update')
  deleteContact(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('contactId', ParseUUIDPipe) contactId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.subresources.deleteContact(id, contactId, user.id);
  }

  // ── Addresses ─────────────────────────────────────────────────────────────

  @Get(':id/addresses')
  @RequirePermission('participants.read')
  listAddresses(@Param('id', ParseUUIDPipe) id: string) {
    return this.subresources.listAddresses(id);
  }

  @Post(':id/addresses')
  @RequirePermission('participants.update')
  createAddress(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(personAddressSchema)) body: PersonAddressInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.subresources.createAddress(id, body, user.id);
  }

  @Patch(':id/addresses/:addressId')
  @RequirePermission('participants.update')
  updateAddress(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('addressId', ParseUUIDPipe) addressId: string,
    @Body(zodBody(personAddressSchema)) body: PersonAddressInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.subresources.updateAddress(id, addressId, body, user.id);
  }

  // ── DOC IDs (§7.2: justice field class gates READ; writes are staff edits) ─

  @Get(':id/doc-ids')
  @RequirePermission('participants.read', 'fields.justice.read')
  listDocIds(@Param('id', ParseUUIDPipe) id: string) {
    return this.subresources.listDocIds(id);
  }

  @Post(':id/doc-ids')
  @RequirePermission('participants.update')
  createDocId(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(participantDocIdSchema)) body: ParticipantDocIdInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.subresources.createDocId(id, body, user.id);
  }

  @Patch(':id/doc-ids/:docIdId')
  @RequirePermission('participants.update')
  updateDocId(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('docIdId', ParseUUIDPipe) docIdId: string,
    @Body(zodBody(participantDocIdSchema.partial())) body: Partial<ParticipantDocIdInput>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.subresources.updateDocId(id, docIdId, body, user.id);
  }

  // ── Inside locations (current + past institutions — §6.1) ─────────────────

  @Get(':id/inside-locations')
  @RequirePermission('participants.read')
  listInsideLocations(@Param('id', ParseUUIDPipe) id: string) {
    return this.subresources.listInsideLocations(id);
  }

  @Post(':id/inside-locations')
  @RequirePermission('participants.update')
  createInsideLocation(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(participantInsideLocationSchema)) body: ParticipantInsideLocationInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.subresources.createInsideLocation(id, body, user.id);
  }

  @Patch(':id/inside-locations/:locationId')
  @RequirePermission('participants.update')
  updateInsideLocation(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Body(zodBody(participantInsideLocationSchema)) body: ParticipantInsideLocationInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.subresources.updateInsideLocation(id, locationId, body, user.id);
  }

  @Delete(':id/inside-locations/:locationId')
  @RequirePermission('participants.update')
  deleteInsideLocation(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.subresources.deleteInsideLocation(id, locationId, user.id);
  }

  /** Records release from custody (§6.1) — see ParticipantsService.release. */
  @Post(':id/release')
  @RequirePermission('participants.update')
  release(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(releaseSchema)) body: ReleaseInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.participants.release(id, body, user);
  }

  // ── Most serious offenses (§7.2: justice field class gates READ; writes are staff edits) ─

  @Get(':id/offenses')
  @RequirePermission('participants.read', 'fields.justice.read')
  listOffenses(@Param('id', ParseUUIDPipe) id: string) {
    return this.subresources.listOffenses(id);
  }

  @Post(':id/offenses')
  @RequirePermission('participants.update')
  createOffense(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(participantOffenseSchema)) body: ParticipantOffenseInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.subresources.createOffense(id, body, user.id);
  }

  @Patch(':id/offenses/:offenseId')
  @RequirePermission('participants.update')
  updateOffense(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('offenseId', ParseUUIDPipe) offenseId: string,
    @Body(zodBody(participantOffenseSchema)) body: ParticipantOffenseInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.subresources.updateOffense(id, offenseId, body, user.id);
  }

  @Delete(':id/offenses/:offenseId')
  @RequirePermission('participants.update')
  deleteOffense(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('offenseId', ParseUUIDPipe) offenseId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.subresources.deleteOffense(id, offenseId, user.id);
  }

  // ── Testimony consents ────────────────────────────────────────────────────

  @Get(':id/testimony-consents')
  @RequirePermission('participants.read')
  listTestimonyConsents(@Param('id', ParseUUIDPipe) id: string) {
    return this.subresources.listTestimonyConsents(id);
  }

  @Post(':id/testimony-consents')
  @RequirePermission('participants.update')
  createTestimonyConsent(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(testimonyConsentSchema)) body: TestimonyConsentInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.subresources.createTestimonyConsent(id, body, user.id);
  }

  @Patch(':id/testimony-consents/:consentId')
  @RequirePermission('participants.update')
  updateTestimonyConsent(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('consentId', ParseUUIDPipe) consentId: string,
    @Body(zodBody(testimonyConsentSchema)) body: TestimonyConsentInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.subresources.updateTestimonyConsent(id, consentId, body, user.id);
  }
}
