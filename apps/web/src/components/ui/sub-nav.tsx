import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';
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
 */
export function SubNav({ items, className }: { items: SubNavItem[]; className?: string }) {
  return (
    <nav className={cn(tabsListClasses, 'flex h-auto min-h-9 w-fit max-w-full', className)}>
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
  );
}
