import { SubNav } from '@/components/ui/sub-nav';

/** Donors ↔ Donations sub-navigation — both live under the /donors mount. */
export function DonorsNav() {
  return (
    <SubNav
      items={[
        { to: '/donors', label: 'Donors', end: true },
        { to: '/donors/donations', label: 'Donations' },
      ]}
    />
  );
}
