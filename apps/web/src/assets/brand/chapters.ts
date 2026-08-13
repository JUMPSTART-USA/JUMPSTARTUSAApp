import usChapterMap from './chapters/us-chapter-map.png';

/**
 * JUMPSTART state chapters, per jumpstartvision.org, for the login page's brand
 * panel. The US map shows all six chapter states highlighted.
 *
 * NOT the chapter-scoping contract. `CHAPTER_STATES` in @jumpstart/shared is the
 * string array wired into 20+ API controllers and every zod schema; this one is
 * display-only and named `CHAPTER_BRAND` so the two cannot be confused at an
 * import site — editing the wrong one would break scoping repo-wide (§7.2).
 *
 * The NC, SC and OH chapter wordmarks used to hang off a `logo` field here. That
 * field was read NOWHERE, so all three images were bundled into every build and
 * never rendered — 152,522 B of the 608,073 B of brand assets. They are real
 * brand facts rather than junk, so they live in docs/brand/chapters/ now:
 * still in the repo, no longer in the bundle. Re-import them here if a design
 * ever calls for per-chapter marks.
 */
export const CHAPTER_BRAND = [
  { code: 'FL', name: 'Florida' },
  { code: 'GA', name: 'Georgia' },
  { code: 'NC', name: 'North Carolina' },
  { code: 'OH', name: 'Ohio' },
  { code: 'SC', name: 'South Carolina' },
  { code: 'TX', name: 'Texas' },
] as const;

export { usChapterMap };
