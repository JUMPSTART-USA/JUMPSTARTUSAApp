import { CHAPTER_NAMES, type ChapterState } from '@jumpstart/shared';
import { useOptionalAuth } from '@/lib/auth';

/**
 * The chapter this session is narrowed to, as words — or nothing.
 *
 * Every string built from this is safe under §7.2 for one structural reason:
 * it is a pure function of the authenticated session, computed before any
 * request runs. It cannot see query results, status codes, or timing, so no
 * copy derived from it can differ between "a matching record exists in another
 * chapter" and "no matching record exists anywhere" — the two worlds §7.2
 * requires to render identically. Consumers get the chapter name from the
 * session or they get null; there is no third input.
 *
 * The corollary is the rule for USING it: name the search's COVERAGE ("in the
 * South Carolina chapter"), never a cause ("in another chapter" is forbidden
 * everywhere — the client does not possess that fact, and copy that claimed it
 * would either lie or leak).
 *
 * `name` is null for all-chapters sessions (admins, unscoped users) — every
 * consumer renders its unscoped copy in that case. Note that a session may be
 * scoped by a chapter PREVIEW, not only by an account scope, so copy must say
 * "viewing", never "your account is".
 */
export function useChapterScope(): { chapter: ChapterState | null; name: string | null } {
  // Optional, not required: DataTable and EntityPicker render in sessionless
  // trees (the tokenized portal, unit tests), where "no session" rightly means
  // "no scope to name" rather than a crash.
  const user = useOptionalAuth()?.user;
  const chapter = (user?.chapter as ChapterState | undefined) ?? null;
  return { chapter, name: chapter ? (CHAPTER_NAMES[chapter] ?? chapter) : null };
}
