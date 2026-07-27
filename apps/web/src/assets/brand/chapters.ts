import northCarolinaWhite from './chapters/north-carolina-white.png';
import ohioGold from './chapters/ohio-gold.png';
import southCarolina from './chapters/south-carolina.svg';
import usChapterMap from './chapters/us-chapter-map.png';

/**
 * JUMPSTART state chapters, per jumpstartvision.org. Only NC and SC publish
 * dedicated chapter wordmarks; Ohio has a gold state silhouette; the rest use
 * the national logo. The US map shows all six chapter states highlighted.
 */
export const CHAPTER_STATES = [
  { code: 'FL', name: 'Florida' },
  { code: 'GA', name: 'Georgia' },
  { code: 'NC', name: 'North Carolina', logo: northCarolinaWhite },
  { code: 'OH', name: 'Ohio', logo: ohioGold },
  { code: 'SC', name: 'South Carolina', logo: southCarolina },
  { code: 'TX', name: 'Texas' },
] as const;

export { usChapterMap };
