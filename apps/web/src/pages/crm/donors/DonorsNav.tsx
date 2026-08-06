import { SubNav } from '@/components/ui/sub-nav';

/** Development sub-navigation — all giving screens live under the /donors mount. */
export function DonorsNav() {
  return (
    <SubNav
      items={[
        { to: '/donors', label: 'Donors', end: true },
        { to: '/donors/donations', label: 'Donations' },
        { to: '/donors/pledges', label: 'Pledges' },
        { to: '/donors/recurring', label: 'Recurring' },
        { to: '/donors/acknowledgments', label: 'Acknowledgments' },
        { to: '/donors/tasks', label: 'Tasks' },
        { to: '/donors/setup', label: 'Setup' },
      ]}
    />
  );
}
