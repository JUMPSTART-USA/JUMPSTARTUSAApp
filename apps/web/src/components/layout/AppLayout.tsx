import {
  CHAPTER_NAMES,
  CHAPTER_STATES,
  ROLE_KEYS,
  ROLE_NAMES,
  type ChapterState,
  type PermissionKey,
  type RoleKey,
} from '@jumpstart/shared';
import {
  BarChart3,
  Briefcase,
  Building2,
  Bus,
  CalendarDays,
  Eye,
  GraduationCap,
  HandHeart,
  HeartHandshake,
  Home,
  Inbox,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Mail,
  Menu,
  School,
  Settings,
  Users,
  UsersRound,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import logoWhite from '@/assets/brand/jumpstart-logo-white.png';
import { useRecordScreenHistory } from '@/components/BackLink';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/input';
import { useAuth } from '@/lib/auth';
import { usePortalRequestsPending } from '@/lib/portal-requests';
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
      { to: '/communications', label: 'Communications', icon: Mail, permission: 'communications.read' },
      { to: '/vehicles', label: 'Vehicles', icon: Bus, permission: 'vehicles.read' },
      { to: '/reports', label: 'Reports', icon: BarChart3, permission: 'reports.read' },
    ],
  },
  {
    title: 'Administration',
    items: [{ to: '/admin', label: 'Admin', icon: Settings, permission: 'admin.users' }],
  },
  {
    title: 'Help',
    items: [{ to: '/support', label: 'Support', icon: LifeBuoy, permission: 'support.access' }],
  },
];

export function AppLayout() {
  const { user, can, logout, viewAs } = useAuth();
  const navigate = useNavigate();
  const [navOpen, setNavOpen] = useState(false);
  useRecordScreenHistory();
  // Fetches only for users holding case_management.read (hook is self-gating).
  const portalPending = usePortalRequestsPending();

  if (!user) {
    navigate('/login');
    return null;
  }

  // A chapter preview only matters when it differs from the account's default view.
  const chapterPreview =
    user.viewChapter && user.viewChapter !== user.actualChapter
      ? (user.viewChapter as ChapterState)
      : null;

  return (
    <div className="flex min-h-screen">
      {/* Backdrop for the mobile nav drawer */}
      {navOpen ? (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={() => setNavOpen(false)}
          aria-hidden="true"
        />
      ) : null}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-60 flex-col bg-navy-deep text-white transition-transform duration-200 lg:translate-x-0',
          navOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-20 flex-col justify-center border-b border-white/10 px-4">
          {/* brightness(0) invert(1) flattens the PNG's antialiased grays to pure white */}
          <img
            src={logoWhite}
            alt="JUMPSTART"
            className="h-10 w-auto self-start [filter:brightness(0)_invert(1)]"
          />
          <div className="mt-1.5 text-[11px] tracking-wide text-white/50">Operations Platform</div>
          <button
            type="button"
            className="absolute right-3 top-3 rounded-md p-1 text-white/70 hover:bg-white/10 hover:text-white lg:hidden"
            onClick={() => setNavOpen(false)}
            aria-label="Close navigation"
          >
            <X className="h-5 w-5" />
          </button>
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
                      onClick={() => setNavOpen(false)}
                      className={({ isActive }) =>
                        cn(
                          'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-white/70 transition-colors hover:bg-white/10 hover:text-white',
                          isActive &&
                            'bg-white/10 font-medium text-white shadow-[inset_3px_0_0_0_hsl(var(--gold))]',
                        )
                      }
                    >
                      <item.icon className="h-4 w-4" />
                      {item.label}
                      {item.to === '/case-management' && portalPending.data?.total ? (
                        <span className="ml-auto rounded-full bg-gold px-1.5 py-0.5 text-[11px] font-semibold leading-none text-navy-ink">
                          {portalPending.data.total}
                        </span>
                      ) : null}
                    </NavLink>
                  ))}
                </div>
              </div>
            );
          })}
        </nav>

        <div className="border-t border-white/10 p-3">
          {user.actualRoles.includes('admin') ? (
            <div className="mb-3 px-2">
              <label
                htmlFor="view-as-role"
                className="text-[11px] font-semibold uppercase tracking-wider text-white/40"
              >
                View as role
              </label>
              <Select
                id="view-as-role"
                value={user.viewAsRole ?? ''}
                onChange={(e) => void viewAs({ role: (e.target.value || null) as RoleKey | null })}
                className="mt-1 h-8 w-full border-white/20 bg-white/10 text-white [&>option]:bg-navy-deep [&>option]:text-white"
              >
                <option value="">My access (Administrator)</option>
                {ROLE_KEYS.filter((role) => role !== 'admin').map((role) => (
                  <option key={role} value={role}>
                    {ROLE_NAMES[role]}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}
          <div className="mb-2 px-2 leading-tight">
            <div className="text-sm font-medium text-white">
              {user.firstName} {user.lastName}
            </div>
            <div className="truncate text-xs text-white/50">{user.email}</div>
            {user.allowedChapters === null || user.allowedChapters.length > 1 ? (
              <Select
                aria-label="Viewing chapter"
                value={user.viewChapter ?? ''}
                onChange={(e) =>
                  void viewAs({ chapter: (e.target.value || null) as ChapterState | null })
                }
                className="mt-1.5 h-8 w-full border-white/20 bg-white/10 text-white [&>option]:bg-navy-deep [&>option]:text-white"
              >
                <option value="">
                  {user.actualChapter
                    ? `${CHAPTER_NAMES[user.actualChapter as ChapterState] ?? user.actualChapter} (default)`
                    : 'All chapters'}
                </option>
                {(user.allowedChapters ?? CHAPTER_STATES)
                  .filter((state) => state !== user.actualChapter)
                  .map((state) => (
                    <option key={state} value={state}>
                      {CHAPTER_NAMES[state as ChapterState] ?? state}
                    </option>
                  ))}
              </Select>
            ) : (
              <div className="mt-0.5 text-[11px] font-medium text-gold">
                {user.chapter
                  ? `${CHAPTER_NAMES[user.chapter as ChapterState] ?? user.chapter} chapter`
                  : 'All chapters'}
              </div>
            )}
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

      <div className="flex min-h-screen min-w-0 flex-1 flex-col lg:ml-60">
        <div className="sticky top-0 z-20">
          {user.viewAsRole || chapterPreview ? (
            <div className="flex items-center gap-2.5 border-b border-gold-dark/40 bg-gold px-4 py-2 text-sm text-navy-ink sm:px-6">
              <Eye className="h-4 w-4 shrink-0" />
              <span className="min-w-0">
                <span className="font-semibold">
                  Viewing
                  {user.viewAsRole ? ` as ${ROLE_NAMES[user.viewAsRole]}` : ''}
                  {user.viewAsRole && chapterPreview ? ' ·' : ''}
                  {chapterPreview
                    ? ` ${CHAPTER_NAMES[chapterPreview] ?? chapterPreview} chapter only`
                    : ''}
                  .
                </span>{' '}
                <span className="hidden sm:inline">
                  Navigation and data are limited to this view.
                </span>
              </span>
              <button
                type="button"
                onClick={() => void viewAs({ role: null, chapter: null })}
                className="ml-auto shrink-0 rounded-md border border-navy-ink/30 px-2.5 py-1 text-xs font-semibold hover:bg-navy-ink/10"
              >
                Exit preview
              </button>
            </div>
          ) : null}
          <header className="flex h-14 items-center gap-3 border-b bg-background/90 px-4 backdrop-blur sm:px-6">
            <button
              type="button"
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground lg:hidden"
              onClick={() => setNavOpen(true)}
              aria-label="Open navigation"
            >
              <Menu className="h-5 w-5" />
            </button>
            <GlobalSearch />
          </header>
        </div>
        <main className="flex-1 p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
