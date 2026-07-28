/**
 * JUMPSTART state chapters (§7.2). Records carry a single `state` — their
 * chapter assignment. A user is scoped to exactly one chapter via
 * user_region_scopes, or to ALL chapters when they have no scope row
 * (typical for admin/executive users).
 */
export const CHAPTER_STATES = ['FL', 'GA', 'NC', 'OH', 'SC', 'TX'] as const;
export type ChapterState = (typeof CHAPTER_STATES)[number];

export const CHAPTER_NAMES: Record<ChapterState, string> = {
  FL: 'Florida',
  GA: 'Georgia',
  NC: 'North Carolina',
  OH: 'Ohio',
  SC: 'South Carolina',
  TX: 'Texas',
};

export function isChapterState(value: string): value is ChapterState {
  return (CHAPTER_STATES as readonly string[]).includes(value);
}
