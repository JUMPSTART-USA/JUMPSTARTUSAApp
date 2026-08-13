import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusBadge } from './badge';
import { CommStatusBadge } from '@/pages/communications/shared';
import { EmploymentStatusBadge, HiringStatusBadge } from '@/pages/employment/shared';
import { LifecycleBadge } from '@/pages/crm/shared';

/**
 * Four module-local status→colour maps were folded into STATUS_VARIANTS on the
 * promise that not one badge changed. The maps are gone, so nothing else in the
 * codebase still records what those screens used to look like — these do.
 *
 * The values below are transcribed from the deleted maps, not from the current
 * one. If a future edit to STATUS_VARIANTS re-colours a communications,
 * employment or donor screen, that is the failure this catches; read the "WHAT
 * IS DELIBERATELY NOT HERE" block in badge.tsx before changing an expectation.
 */

/** The class the variant paints with, which is what a reader actually sees. */
function variantOf(status: string, ui: React.ReactElement): string {
  const { unmount } = render(ui);
  const badge = screen.getByText(new RegExp(`^${status.replace(/_/g, ' ')}$`, 'i'));
  const painted = ['success', 'warning', 'destructive', 'info', 'secondary', 'muted-foreground']
    .filter((v) => badge.className.includes(`text-${v}`))
    .join(',');
  unmount();
  return painted === 'muted-foreground' ? 'outline' : painted;
}

describe('folded status colours', () => {
  it.each([
    ['draft', 'outline'],
    ['queued', 'secondary'],
    ['sent', 'info'],
    ['delivered', 'success'],
    ['partially_sent', 'warning'],
    ['failed', 'destructive'],
    ['returned', 'warning'],
  ])('a %s dispatch stays %s', (status, expected) => {
    expect(variantOf(status, <CommStatusBadge status={status} />)).toBe(expected);
    // Same word, same colour, whichever badge renders it — that was the point.
    expect(variantOf(status, <StatusBadge status={status} />)).toBe(expected);
  });

  it.each([
    ['prospect', 'secondary'],
    ['partner', 'info'],
    ['actively_hiring', 'success'],
    ['paused', 'warning'],
    ['inactive', 'outline'],
  ])('an employer that is %s stays %s', (status, expected) => {
    expect(variantOf(status, <HiringStatusBadge status={status} />)).toBe(expected);
  });

  it.each([
    ['applied', 'secondary'],
    ['interviewing', 'info'],
    ['hired', 'success'],
    ['active', 'success'],
    ['terminated', 'destructive'],
    ['resigned', 'warning'],
    ['unknown', 'outline'],
  ])('an employment record that is %s stays %s', (status, expected) => {
    expect(variantOf(status, <EmploymentStatusBadge status={status} />)).toBe(expected);
  });

  it.each([
    ['prospective', 'outline'],
    ['new', 'info'],
    ['active', 'success'],
    ['lapsed', 'warning'],
    ['inactive', 'outline'],
  ])('a %s donor stays %s', (lifecycle, expected) => {
    expect(variantOf(lifecycle, <LifecycleBadge lifecycle={lifecycle as never} />)).toBe(expected);
  });

  /**
   * `completed` is the word that means something local — beside Start and End
   * dates it reads as "this placement ended", not the neutral "done" the kit
   * means — and employment no longer keeps a map to say so. This is what says
   * so instead: change the canonical `completed` and this fails, which is the
   * moment to decide whether employment lists were meant to change too.
   */
  it('an employment record reads completed the way the kit does', () => {
    expect(variantOf('completed', <EmploymentStatusBadge status="completed" />)).toBe('info');
    expect(variantOf('completed', <StatusBadge status="completed" />)).toBe('info');
  });

  it('renders an em dash, not an empty badge, for a missing status', () => {
    render(<StatusBadge status={null} />);
    // getByText throws when it finds nothing, so this asserts presence too.
    const dash = screen.getByText('—');
    expect(dash.className).not.toContain('rounded-full');
  });
});
