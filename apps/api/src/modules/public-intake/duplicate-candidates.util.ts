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
 *
 * Chapter scoping (§7.2, docs/chapter-scoping.md "Cross-chapter dedupe"):
 * `userChapter` restricts a scoped reviewer to candidates they could actually
 * act on — their chapter's profiles or profile-less persons — so the queue's
 * dedupe decoration cannot become a cross-chapter people-lookup oracle.
 * All-chapters reviewers (null) keep the global match set for org-wide dedupe.
 */
export async function findDuplicateCandidates(
  prisma: PrismaService,
  probe: DuplicateProbe,
  userChapter: string | null,
) {
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
    where: {
      deletedAt: null,
      OR: or,
      // Scoped reviewers only see candidates in their own chapter (or with no
      // profile yet); mirrors participants.duplicateCheck and donors matching.
      ...(userChapter
        ? {
            AND: [
              {
                OR: [
                  { participantProfile: { chapterState: userChapter } },
                  { volunteerProfile: { chapterState: userChapter } },
                  { participantProfile: { is: null }, volunteerProfile: { is: null } },
                ],
              },
            ],
          }
        : {}),
    },
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
