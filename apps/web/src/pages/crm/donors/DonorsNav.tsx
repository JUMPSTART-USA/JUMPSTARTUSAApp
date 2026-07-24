import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

/** Donors ↔ Donations sub-navigation — both live under the /donors mount. */
export function DonorsNav({ active }: { active: 'donors' | 'donations' }) {
  const linkClass = (isActive: boolean) =>
    cn(
      'inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium transition-all',
      isActive ? 'bg-card text-foreground shadow' : 'hover:text-foreground',
    );
  return (
    <div className="inline-flex h-9 items-center gap-1 rounded-lg bg-muted p-1 text-muted-foreground">
      <Link to="/donors" className={linkClass(active === 'donors')}>
        Donors
      </Link>
      <Link to="/donors/donations" className={linkClass(active === 'donations')}>
        Donations
      </Link>
    </div>
  );
}
