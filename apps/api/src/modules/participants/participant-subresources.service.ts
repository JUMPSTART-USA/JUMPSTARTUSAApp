import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@jumpstart/database';
import type {
  ParticipantDocIdInput,
  ParticipantInsideLocationInput,
  ParticipantOffenseInput,
  PersonAddressInput,
  PersonContactInput,
  TestimonyConsentInput,
} from '@jumpstart/shared';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Person-level sub-resources reached through the participant record:
 * contacts, address history, DOC IDs, testimony consents.
 *
 * Contact/address/consent PATCH bodies are validated against the FULL shared
 * schema (their cross-field refinements — §7.4 minors rule, date ordering —
 * do not survive .partial()), so updates are whole-record replacements and
 * omitted optional fields clear to null.
 */
@Injectable()
export class ParticipantSubresourcesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Resolve profile → person; 404 when the participant is missing/deleted. */
  private async personIdFor(participantId: string): Promise<string> {
    const profile = await this.prisma.participantProfile.findFirst({
      where: { id: participantId, deletedAt: null },
      select: { personId: true },
    });
    if (!profile) throw new NotFoundException('Participant not found');
    return profile.personId;
  }

  // ── Contacts (emergency contacts & family, incl. minors — §7.4) ───────────

  async listContacts(participantId: string) {
    const personId = await this.personIdFor(participantId);
    return this.prisma.personContact.findMany({
      where: { personId, deletedAt: null },
      orderBy: [{ isEmergency: 'desc' }, { name: 'asc' }],
    });
  }

  async createContact(participantId: string, input: PersonContactInput, userId: string) {
    const personId = await this.personIdFor(participantId);
    const contact = await this.prisma.personContact.create({
      data: { ...input, personId, createdById: userId, updatedById: userId },
    });
    await this.audit.logCreate(userId, 'person_contact', contact.id, contact);
    return contact;
  }

  async updateContact(
    participantId: string,
    contactId: string,
    input: PersonContactInput,
    userId: string,
  ) {
    const personId = await this.personIdFor(participantId);
    const existing = await this.prisma.personContact.findFirst({
      where: { id: contactId, personId, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Contact not found');
    const updated = await this.prisma.personContact.update({
      where: { id: contactId },
      data: {
        name: input.name,
        relationship: input.relationship,
        phone: input.phone ?? null,
        email: input.email ?? null,
        isEmergency: input.isEmergency,
        isMinor: input.isMinor,
        guardianName: input.guardianName ?? null,
        notes: input.notes ?? null,
        updatedById: userId,
      },
    });
    await this.audit.logUpdate(userId, 'person_contact', contactId, existing, updated);
    return updated;
  }

  async deleteContact(participantId: string, contactId: string, userId: string) {
    const personId = await this.personIdFor(participantId);
    const existing = await this.prisma.personContact.findFirst({
      where: { id: contactId, personId, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Contact not found');
    await this.prisma.personContact.update({
      where: { id: contactId },
      data: { deletedAt: new Date(), updatedById: userId },
    });
    await this.audit.logDelete(userId, 'person_contact', contactId, existing);
    return { ok: true };
  }

  // ── Addresses (history table; no delete — §4.1.6) ─────────────────────────

  async listAddresses(participantId: string) {
    const personId = await this.personIdFor(participantId);
    return this.prisma.personAddress.findMany({
      where: { personId },
      orderBy: [{ isCurrent: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async createAddress(participantId: string, input: PersonAddressInput, userId: string) {
    const personId = await this.personIdFor(participantId);
    const address = await this.prisma.$transaction(async (tx) => {
      if (input.isCurrent) await this.makeCurrent(tx, personId, null, input, userId);
      return tx.personAddress.create({
        data: { ...input, personId, createdById: userId, updatedById: userId },
      });
    });
    await this.audit.logCreate(userId, 'person_address', address.id, address);
    return address;
  }

  async updateAddress(
    participantId: string,
    addressId: string,
    input: PersonAddressInput,
    userId: string,
  ) {
    const personId = await this.personIdFor(participantId);
    const existing = await this.prisma.personAddress.findFirst({
      where: { id: addressId, personId },
    });
    if (!existing) throw new NotFoundException('Address not found');
    const updated = await this.prisma.$transaction(async (tx) => {
      if (input.isCurrent) await this.makeCurrent(tx, personId, addressId, input, userId);
      return tx.personAddress.update({
        where: { id: addressId },
        data: {
          addressLine1: input.addressLine1,
          addressLine2: input.addressLine2 ?? null,
          city: input.city,
          state: input.state,
          zip: input.zip,
          addressType: input.addressType ?? null,
          isCurrent: input.isCurrent,
          validFrom: input.validFrom ?? null,
          validTo: input.validTo ?? null,
          notes: input.notes ?? null,
          updatedById: userId,
        },
      });
    });
    await this.audit.logUpdate(userId, 'person_address', addressId, existing, updated);
    return updated;
  }

  /**
   * A current address is mirrored onto Person's flat mailing-address fields
   * and every other address row loses its isCurrent flag (§5: current address
   * on persons, history in person_addresses).
   */
  private async makeCurrent(
    tx: Prisma.TransactionClient,
    personId: string,
    keepAddressId: string | null,
    input: PersonAddressInput,
    userId: string,
  ) {
    await tx.personAddress.updateMany({
      where: {
        personId,
        isCurrent: true,
        ...(keepAddressId ? { id: { not: keepAddressId } } : {}),
      },
      data: { isCurrent: false, updatedById: userId },
    });
    await tx.person.update({
      where: { id: personId },
      data: {
        addressLine1: input.addressLine1,
        addressLine2: input.addressLine2 ?? null,
        city: input.city,
        state: input.state,
        zip: input.zip,
        updatedById: userId,
      },
    });
  }

  // ── DOC IDs (justice-history field class — §7.2, §7.5) ────────────────────

  async listDocIds(participantId: string) {
    await this.personIdFor(participantId);
    return this.prisma.participantDocId.findMany({
      where: { participantProfileId: participantId },
      orderBy: [{ state: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async createDocId(participantId: string, input: ParticipantDocIdInput, userId: string) {
    await this.personIdFor(participantId);
    await this.assertAgreementExists(input.dataSharingAgreementId);
    try {
      const docId = await this.prisma.participantDocId.create({
        data: { ...input, participantProfileId: participantId, createdById: userId, updatedById: userId },
      });
      await this.audit.logCreate(userId, 'participant_doc_id', docId.id, docId);
      return docId;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException(
          'This DOC number is already recorded for this participant and state',
        );
      }
      throw err;
    }
  }

  async updateDocId(
    participantId: string,
    docIdId: string,
    input: Partial<ParticipantDocIdInput>,
    userId: string,
  ) {
    await this.personIdFor(participantId);
    const existing = await this.prisma.participantDocId.findFirst({
      where: { id: docIdId, participantProfileId: participantId },
    });
    if (!existing) throw new NotFoundException('DOC ID not found');
    if (input.dataSharingAgreementId) {
      await this.assertAgreementExists(input.dataSharingAgreementId);
    }
    try {
      const updated = await this.prisma.participantDocId.update({
        where: { id: docIdId },
        data: { ...input, updatedById: userId },
      });
      await this.audit.logUpdate(userId, 'participant_doc_id', docIdId, existing, updated);
      return updated;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException(
          'This DOC number is already recorded for this participant and state',
        );
      }
      throw err;
    }
  }

  private async assertAgreementExists(agreementId: string | undefined) {
    if (!agreementId) return;
    const agreement = await this.prisma.dataSharingAgreement.findUnique({
      where: { id: agreementId },
      select: { id: true },
    });
    if (!agreement) throw new BadRequestException('Data-sharing agreement does not exist');
  }

  // ── Inside locations (current + past institutions — §6.1) ─────────────────

  private static readonly LOCATION_INCLUDE = {
    institution: { select: { id: true, name: true, state: true } },
  } as const;

  async listInsideLocations(participantId: string) {
    await this.personIdFor(participantId);
    return this.prisma.participantInsideLocation.findMany({
      where: { participantProfileId: participantId, deletedAt: null },
      include: ParticipantSubresourcesService.LOCATION_INCLUDE,
      orderBy: [{ status: 'asc' }, { startDate: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async createInsideLocation(
    participantId: string,
    input: ParticipantInsideLocationInput,
    userId: string,
  ) {
    await this.personIdFor(participantId);
    await this.assertInstitutionExists(input.institutionId);
    const location = await this.prisma.$transaction(async (tx) => {
      if (input.status === 'active') {
        await this.closeActiveLocations(tx, participantId, input.startDate ?? new Date(), userId);
      }
      return tx.participantInsideLocation.create({
        data: {
          ...this.locationData(input),
          participantProfileId: participantId,
          createdById: userId,
          updatedById: userId,
        },
        include: ParticipantSubresourcesService.LOCATION_INCLUDE,
      });
    });
    await this.audit.logCreate(userId, 'participant_inside_location', location.id, location);
    return location;
  }

  async updateInsideLocation(
    participantId: string,
    locationId: string,
    input: ParticipantInsideLocationInput,
    userId: string,
  ) {
    await this.personIdFor(participantId);
    await this.assertInstitutionExists(input.institutionId);
    const existing = await this.prisma.participantInsideLocation.findFirst({
      where: { id: locationId, participantProfileId: participantId, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Inside location not found');
    const updated = await this.prisma.$transaction(async (tx) => {
      if (input.status === 'active') {
        await this.closeActiveLocations(
          tx,
          participantId,
          input.startDate ?? new Date(),
          userId,
          locationId,
        );
      }
      return tx.participantInsideLocation.update({
        where: { id: locationId },
        data: { ...this.locationData(input), updatedById: userId },
        include: ParticipantSubresourcesService.LOCATION_INCLUDE,
      });
    });
    await this.audit.logUpdate(userId, 'participant_inside_location', locationId, existing, updated);
    return updated;
  }

  async deleteInsideLocation(participantId: string, locationId: string, userId: string) {
    await this.personIdFor(participantId);
    const existing = await this.prisma.participantInsideLocation.findFirst({
      where: { id: locationId, participantProfileId: participantId, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Inside location not found');
    await this.prisma.participantInsideLocation.update({
      where: { id: locationId },
      data: { deletedAt: new Date(), updatedById: userId },
    });
    await this.audit.logDelete(userId, 'participant_inside_location', locationId, existing);
    return { ok: true };
  }

  /** One active location per participant: close the others when one goes active. */
  private closeActiveLocations(
    tx: Prisma.TransactionClient,
    participantId: string,
    endDate: Date,
    userId: string,
    excludeId?: string,
  ) {
    return tx.participantInsideLocation.updateMany({
      where: {
        participantProfileId: participantId,
        status: 'active',
        deletedAt: null,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      data: { status: 'inactive', endDate, updatedById: userId },
    });
  }

  /** Whole-record replacement: omitted optionals clear to null. */
  private locationData(input: ParticipantInsideLocationInput) {
    return {
      institutionId: input.institutionId,
      status: input.status,
      startDate: input.startDate ?? null,
      endDate: input.endDate ?? null,
      notes: input.notes ?? null,
    };
  }

  private async assertInstitutionExists(institutionId: string) {
    const institution = await this.prisma.institution.findFirst({
      where: { id: institutionId, deletedAt: null },
      select: { id: true },
    });
    if (!institution) throw new BadRequestException('Institution does not exist');
  }

  // ── Most serious offenses (§7.2 justice field class, like DOC IDs) ────────

  async listOffenses(participantId: string) {
    await this.personIdFor(participantId);
    return this.prisma.participantOffense.findMany({
      where: { participantProfileId: participantId, deletedAt: null },
      orderBy: [{ convictionDate: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async createOffense(participantId: string, input: ParticipantOffenseInput, userId: string) {
    await this.personIdFor(participantId);
    const offense = await this.prisma.participantOffense.create({
      data: {
        ...this.offenseData(input),
        participantProfileId: participantId,
        createdById: userId,
        updatedById: userId,
      },
    });
    await this.audit.logCreate(userId, 'participant_offense', offense.id, offense);
    return offense;
  }

  async updateOffense(
    participantId: string,
    offenseId: string,
    input: ParticipantOffenseInput,
    userId: string,
  ) {
    await this.personIdFor(participantId);
    const existing = await this.prisma.participantOffense.findFirst({
      where: { id: offenseId, participantProfileId: participantId, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Offense not found');
    const updated = await this.prisma.participantOffense.update({
      where: { id: offenseId },
      data: { ...this.offenseData(input), updatedById: userId },
    });
    await this.audit.logUpdate(userId, 'participant_offense', offenseId, existing, updated);
    return updated;
  }

  async deleteOffense(participantId: string, offenseId: string, userId: string) {
    await this.personIdFor(participantId);
    const existing = await this.prisma.participantOffense.findFirst({
      where: { id: offenseId, participantProfileId: participantId, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Offense not found');
    await this.prisma.participantOffense.update({
      where: { id: offenseId },
      data: { deletedAt: new Date(), updatedById: userId },
    });
    await this.audit.logDelete(userId, 'participant_offense', offenseId, existing);
    return { ok: true };
  }

  /** Whole-record replacement: omitted optionals clear to null. */
  private offenseData(input: ParticipantOffenseInput) {
    return {
      offense: input.offense,
      offenseType: input.offenseType,
      convictionDate: input.convictionDate ?? null,
      sentenceYears: input.sentenceYears ?? null,
      sentenceMonths: input.sentenceMonths ?? null,
      sentenceDays: input.sentenceDays ?? null,
    };
  }

  // ── Testimony consents (revocable, never deleted — §7.4) ──────────────────

  async listTestimonyConsents(participantId: string) {
    const personId = await this.personIdFor(participantId);
    return this.prisma.testimonyConsent.findMany({
      where: { personId },
      orderBy: { grantedAt: 'desc' },
    });
  }

  async createTestimonyConsent(
    participantId: string,
    input: TestimonyConsentInput,
    userId: string,
  ) {
    const personId = await this.personIdFor(participantId);
    const consent = await this.prisma.testimonyConsent.create({
      data: { ...input, personId, createdById: userId, updatedById: userId },
    });
    await this.audit.logCreate(userId, 'testimony_consent', consent.id, consent);
    return consent;
  }

  async updateTestimonyConsent(
    participantId: string,
    consentId: string,
    input: TestimonyConsentInput,
    userId: string,
  ) {
    const personId = await this.personIdFor(participantId);
    const existing = await this.prisma.testimonyConsent.findFirst({
      where: { id: consentId, personId },
    });
    if (!existing) throw new NotFoundException('Testimony consent not found');
    const updated = await this.prisma.testimonyConsent.update({
      where: { id: consentId },
      data: {
        scope: input.scope,
        grantedAt: input.grantedAt,
        revokedAt: input.revokedAt ?? null,
        notes: input.notes ?? null,
        updatedById: userId,
      },
    });
    await this.audit.logUpdate(userId, 'testimony_consent', consentId, existing, updated);
    return updated;
  }
}
