import type { Prisma } from '@jumpstart/database';
import type { PrismaService } from '../../prisma/prisma.service';

export interface DuplicateProbe {
  firstName: string;
  lastName: string;
  phone?: string | null;
  email?: string | null;
  dateOfBirth?: Date | null;
}

/**
 * §5 duplicate matching — case-insensitive full-name match, same phone/email,
 * or same DOB + last name — with the roles each candidate already holds.
 * Duplicated from the participants module (cross-module services are not
 * imported; PrismaService is the shared surface). Queue items are decorated
 * with these candidates so reviewers LINK instead of CREATE (§6.11).
 */
export async function findDuplicateCandidates(prisma: PrismaService, probe: DuplicateProbe) {
  const or: Prisma.PersonWhereInput[] = [
    {
      firstName: { equals: probe.firstName, mode: 'insensitive' },
      lastName: { equals: probe.lastName, mode: 'insensitive' },
    },
  ];
  if (probe.phone) or.push({ primaryPhone: probe.phone });
  if (probe.email) or.push({ primaryEmail: { equals: probe.email, mode: 'insensitive' } });
  if (probe.dateOfBirth) {
    or.push({
      dateOfBirth: probe.dateOfBirth,
      lastName: { equals: probe.lastName, mode: 'insensitive' },
    });
  }

  const matches = await prisma.person.findMany({
    where: { deletedAt: null, OR: or },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      preferredName: true,
      dateOfBirth: true,
      primaryPhone: true,
      primaryEmail: true,
      city: true,
      state: true,
      participantProfile: { select: { id: true, participantNumber: true, deletedAt: true } },
      volunteerProfile: { select: { id: true, deletedAt: true } },
      user: { select: { id: true } },
    },
    take: 20,
  });

  return matches.map(({ participantProfile, volunteerProfile, user, ...person }) => ({
    ...person,
    participantProfileId:
      participantProfile && !participantProfile.deletedAt ? participantProfile.id : null,
    participantNumber:
      participantProfile && !participantProfile.deletedAt
        ? participantProfile.participantNumber
        : null,
    volunteerProfileId:
      volunteerProfile && !volunteerProfile.deletedAt ? volunteerProfile.id : null,
    profileTypes: [
      ...(participantProfile && !participantProfile.deletedAt ? ['participant'] : []),
      ...(volunteerProfile && !volunteerProfile.deletedAt ? ['volunteer'] : []),
      ...(user ? ['staff'] : []),
    ],
  }));
}
