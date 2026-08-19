/**
 * JUMPSTART chapters (§7.2). Records carry a single chapter assignment. A user
 * is scoped to exactly one chapter via user_region_scopes, or to ALL chapters
 * when they have no scope row (typical for admin/executive users).
 *
 * USA is the national office, and it is a PEER of the state chapters rather
 * than a parent of them. That is the whole point: national staff hold their own
 * Development records and are isolated from every state chapter's, exactly as
 * the states are isolated from each other. It buys no cross-chapter visibility
 * — a USA-scoped user sees USA rows and nothing else, and nationwide reporting
 * is a separate capability that does not exist yet (see docs/chapter-scoping.md).
 */
export const CHAPTER_STATES = ['FL', 'GA', 'NC', 'OH', 'SC', 'TX', 'USA'] as const;
export type ChapterState = (typeof CHAPTER_STATES)[number];

/**
 * Chapters the PUBLIC may route themselves to.
 *
 * Deliberately not CHAPTER_STATES. The public referral and volunteer-application
 * forms ask which chapter should receive the submission, and "the national
 * office" is not a sensible answer — those queues are worked by state chapter
 * staff. Offering USA there would silently strand intake in a queue nobody
 * works. Keep this list to chapters that actually take public intake.
 */
export const PUBLIC_INTAKE_STATES = ['FL', 'GA', 'NC', 'OH', 'SC', 'TX'] as const;
export type PublicIntakeState = (typeof PUBLIC_INTAKE_STATES)[number];

export const CHAPTER_NAMES: Record<ChapterState, string> = {
  FL: 'Florida',
  GA: 'Georgia',
  NC: 'North Carolina',
  OH: 'Ohio',
  SC: 'South Carolina',
  TX: 'Texas',
  USA: 'JUMPSTART USA (National)',
};

export function isChapterState(value: string): value is ChapterState {
  return (CHAPTER_STATES as readonly string[]).includes(value);
}

/** The national office, which is a chapter like any other for scoping. */
export const NATIONAL_CHAPTER = 'USA' as const;
