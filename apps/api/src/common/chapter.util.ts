import { ForbiddenException } from '@nestjs/common';

/**
 * Record-level chapter scoping (§7.2). List endpoints already force
 * `state: user.chapter ?? requested`; this is the matching guard for
 * get-by-id and mutations so a chapter-scoped user cannot reach another
 * chapter's record by id.
 *
 * Only a proven mismatch is blocked: unscoped users (chapter null) pass, and
 * records without a state pass (the optional-state schemas make stateless
 * records chapter-neutral). Each module derives `recordState` exactly the way
 * its list filter does (own column, institution.state, or person.state).
 */
export function assertChapterAccess(
  userChapter: string | null,
  recordState: string | null | undefined,
): void {
  if (userChapter && recordState && recordState !== userChapter) {
    throw new ForbiddenException('Record belongs to another chapter');
  }
}
