import { BadRequestException } from '@nestjs/common';
import { assertChapterAccess } from '../../common/chapter.util';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Resolves a staff-supplied participant FK to a live profile (mirrors
 * case-management/participant.util.ts — modules keep their own copy so they
 * stay self-contained). Without this, a bad id surfaces as a Prisma P2003
 * (500) instead of a 400.
 *
 * Chapter scoping (§7.2): portal records inherit their chapter from the
 * participant, so the same choke point rejects a scoped user referencing
 * another chapter's participant.
 */
export async function assertParticipant(
  prisma: PrismaService,
  participantProfileId: string,
  userChapter: string | null,
) {
  const profile = await prisma.participantProfile.findFirst({
    where: { id: participantProfileId, deletedAt: null },
  });
  if (!profile) throw new BadRequestException('Unknown participant');
  assertChapterAccess(userChapter, profile.chapterState);
  return profile;
}

/**
 * The participant summary every portal queue row carries — exactly the shape
 * drug-test / travel-request rows use, so queue tables render identically.
 */
export const PARTICIPANT_SUMMARY_SELECT = {
  select: { person: { select: { firstName: true, lastName: true } } },
} as const;

/** The participantProfile search clause every queue list shares. */
export function participantSearch(search: string) {
  return {
    participantProfile: {
      OR: [
        { participantNumber: { contains: search, mode: 'insensitive' as const } },
        { person: { firstName: { contains: search, mode: 'insensitive' as const } } },
        { person: { lastName: { contains: search, mode: 'insensitive' as const } } },
      ],
    },
  };
}
