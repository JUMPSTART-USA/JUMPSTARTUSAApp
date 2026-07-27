import type { PermissionKey } from '@jumpstart/shared';
import {
  BarChart3,
  Briefcase,
  Building2,
  Bus,
  CalendarDays,
  GraduationCap,
  HandHeart,
  HeartHandshake,
  Home,
  Inbox,
  LayoutDashboard,
  LogOut,
  School,
  Settings,
  Users,
  UsersRound,
} from 'lucide-react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import logoWhite from '@/assets/brand/jumpstart-logo-white.png';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { GlobalSearch } from './GlobalSearch';

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  permission: PermissionKey;
}

/**
 * Role-based navigation (§4.1.4): items render only when the user holds the
 * module's read permission — the same definitions the API guards enforce.
 */
const NAV_SECTIONS: { title: string; items: NavItem[] }[] = [
  {
    title: 'Overview',
    items: [{ to: '/', label: 'Dashboard', icon: LayoutDashboard, permission: 'dashboard.read' }],
  },
  {
    title: 'Programs',
    items: [
      { to: '/participants', label: 'Participants', icon: Users, permission: 'participants.read' },
      { to: '/institutions', label: 'Institutions', icon: Building2, permission: 'institutions.read' },
      { to: '/inside-classes', label: 'Inside Classes', icon: School, permission: 'inside_classes.read' },
      { to: '/outside-programs', label: 'Outside Programs', icon: GraduationCap, permission: 'outside_programs.read' },
      { to: '/housing', label: 'Housing', icon: Home, permission: 'housing.read' },
      { to: '/case-management', label: 'Case Management', icon: HeartHandshake, permission: 'case_management.read' },
    ],
  },
  {
    title: 'People',
    items: [
      { to: '/volunteers', label: 'Volunteers', icon: HandHeart, permission: 'volunteers.read' },
      { to: '/mentoring', label: 'Alumni & Mentoring', icon: UsersRound, permission: 'mentoring.read' },
      { to: '/intake', label: 'Intake Queues', icon: Inbox, permission: 'intake_queues.read' },
    ],
  },
  {
    title: 'Development',
    items: [
      { to: '/donors', label: 'Donors', icon: HandHeart, permission: 'donors.read' },
      { to: '/campaigns', label: 'Campaigns', icon: BarChart3, permission: 'campaigns.read' },
      { to: '/events', label: 'Events', icon: CalendarDays, permission: 'events.read' },
      { to: '/vendors', label: 'Vendors', icon: Briefcase, permission: 'vendors.read' },
    ],
  },
  {
    title: 'Operations',
    items: [
      { to: '/employers', label: 'Employers', icon: Briefcase, permission: 'employers.read' },
      { to: '/vehicles', label: 'Vehicles', icon: Bus, permission: 'vehicles.read' },
      { to: '/reports', label: 'Reports', icon: BarChart3, permission: 'reports.read' },
    ],
  },
  {
    title: 'Administration',
    items: [{ to: '/admin', label: 'Admin', icon: Settings, permission: 'admin.users' }],
  },
];

export function AppLayout() {
  const { user, can, logout } = useAuth();
  const navigate = useNavigate();

  if (!user) {
    navigate('/login');
    return null;
  }

  return (
    <div className="flex min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-30 flex w-60 flex-col bg-navy-deep text-white">
        <div className="flex h-20 flex-col justify-center border-b border-white/10 px-4">
          {/* brightness(0) invert(1) flattens the PNG's antialiased grays to pure white */}
          <img
            src={logoWhite}
            alt="JUMPSTART"
            className="h-10 w-auto self-start [filter:brightness(0)_invert(1)]"
          />
          <div className="mt-1.5 text-[11px] tracking-wide text-white/50">Operations Platform</div>
        </div>

        <nav className="flex-1 space-y-4 overflow-y-auto p-3">
          {NAV_SECTIONS.map((section) => {
            const visible = section.items.filter((item) => can(item.permission));
            if (visible.length === 0) return null;
            return (
              <div key={section.title}>
                <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-white/40">
                  {section.title}
                </div>
                <div className="space-y-0.5">
                  {visible.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.to === '/'}
                      className={({ isActive }) =>
                        cn(
                          'flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-white/70 transition-colors hover:bg-white/10 hover:text-white',
                          isActive &&
                            'bg-white/10 font-medium text-white shadow-[inset_3px_0_0_0_#FDB835]',
                        )
                      }
                    >
                      <item.icon className="h-4 w-4" />
                      {item.label}
                    </NavLink>
                  ))}
                </div>
              </div>
            );
          })}
        </nav>

        <div className="border-t border-white/10 p-3">
          <div className="mb-2 px-2 leading-tight">
            <div className="text-sm font-medium text-white">
              {user.firstName} {user.lastName}
            </div>
            <div className="truncate text-xs text-white/50">{user.email}</div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-white/70 hover:bg-white/10 hover:text-white"
            onClick={logout}
          >
            <LogOut className="h-4 w-4" /> Sign out
          </Button>
        </div>
      </aside>

      <div className="ml-60 flex min-h-screen flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-4 border-b bg-background/95 px-6 backdrop-blur">
          <GlobalSearch />
        </header>
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
