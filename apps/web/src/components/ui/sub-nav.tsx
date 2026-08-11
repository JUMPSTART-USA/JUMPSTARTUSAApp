import { NavLink, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { PillOverflow, usePillOverflow } from '@/components/ui/pill-overflow';
import { tabsListClasses, tabsTriggerActiveClasses, tabsTriggerClasses } from '@/components/ui/tabs';

export interface SubNavItem {
  to: string;
  label: string;
  end?: boolean;
}

/**
 * Link-based pill bar for module sub-navigation (admin, case management,
 * mentoring, donors). Visually identical to Tabs; scrolls horizontally on
 * small screens instead of wrapping.
 *
 * The scrolling is signposted rather than silent — see PillOverflow. Case
 * Management's fourteen items overflow at 1280px, and without an edge fade six
 * of its sections looked as though they did not exist.
 */
export function SubNav({ items, className }: { items: SubNavItem[]; className?: string }) {
  const { pathname } = useLocation();
  const { ref, edges } = usePillOverflow<HTMLElement>(pathname);

  return (
    <PillOverflow edges={edges} className="w-fit max-w-full">
      <nav ref={ref} className={cn(tabsListClasses, 'flex h-auto min-h-9 w-fit max-w-full', className)}>
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(tabsTriggerClasses, isActive ? tabsTriggerActiveClasses : 'hover:text-foreground')
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </PillOverflow>
  );
}
