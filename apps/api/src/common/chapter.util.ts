import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { isChapterState } from '@jumpstart/shared';

/**
 * Record-level chapter scoping (§7.2, docs/chapter-scoping.md). List endpoints
 * force `state: user.chapter ?? requested`; this is the matching guard for
 * get-by-id and mutations so a chapter-scoped user cannot reach another
 * chapter's record by id.
 *
 * Only a proven mismatch is blocked: unscoped users (chapter null) pass, and
 * records without a state pass (legacy/public-intake rows are chapter-neutral
 * until staff assign one). Each module derives `recordState` exactly the way
 * its list filter does (own column or the required parent's column).
 */
export function assertChapterAccess(
  userChapter: string | null,
  recordState: string | null | undefined,
): void {
  if (userChapter && recordState && recordState !== userChapter) {
    throw new ForbiddenException('Record belongs to another chapter');
  }
}

/**
 * Create-time chapter stamp (§7.2 rule 2): every new record belongs to exactly
 * one chapter, decided by the CREATOR's chapter membership.
 *
 * - Chapter-scoped user: the record gets THEIR chapter. An explicit different
 *   value is a 403 (same contract as assertChapterAccess).
 * - All-chapters user (admin or unscoped): must pick the chapter explicitly —
 *   a missing or non-chapter value is a 400.
 *
 * Used by every own-column create; child records inherit chapter through their
 * required parent and assert the parent instead.
 */
export function resolveCreateChapter(
  userChapter: string | null,
  inputState: string | null | undefined,
): string {
  if (userChapter) {
    if (inputState && inputState !== userChapter) {
      throw new ForbiddenException('Record belongs to another chapter');
    }
    return userChapter;
  }
  if (!inputState || !isChapterState(inputState)) {
    throw new BadRequestException('Select the chapter (state) for this record');
  }
  return inputState;
}
