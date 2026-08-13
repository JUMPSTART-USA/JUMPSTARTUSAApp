import { StatusBadge } from '@/components/ui/badge';

/** Hiring posture folded into the kit's STATUS_VARIANTS — no key collided. */
export const HiringStatusBadge = StatusBadge;

/**
 * Employment statuses folded too, including `completed`.
 *
 * It is the one word here that means something local — beside Start and End
 * dates a job coach reads "Completed" as *this placement ended*, not the
 * neutral "done" the kit means by it — but both spell it `info`, so the module
 * map that used to hold it only restated the canonical answer. The nuance is
 * recorded in badge.tsx and pinned by badge.test.tsx; whether a finished
 * placement should read as a win rather than a neutral outcome is a product
 * call, and changing it would move pixels on every employment list.
 */
export const EmploymentStatusBadge = StatusBadge;

export const PAY_SUFFIX: Record<string, string> = {
  hourly: '/hr',
  weekly: '/wk',
  annual: '/yr',
};
