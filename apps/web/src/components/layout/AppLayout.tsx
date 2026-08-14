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
  Clock,
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
  UserRound,
  Users,
  UsersRound,
  X,
} from 'lucide-react';
import { Suspense, useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import logoWhite from '@/assets/brand/jumpstart-logo-white.png';
import { useRecordScreenHistory } from '@/components/BackLink';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useIdleExpiryWarning } from '@/lib/session-activity';
import { Button } from '@/components/ui/button';
import { DARK_SELECT, Select } from '@/components/ui/input';
import { useCurrentPageTitle } from '@/components/ui/page-header';
import { PageLoader } from '@/components/ui/spinner';
import { api, ApiError } from '@/lib/api';
import { useAuth, type Me, type ViewAsChange } from '@/lib/auth';
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

/**
 * Applying a view-as change reloads the whole SPA, so it must happen on the
 * value the user SETTLES on — not on the first change event.
 *
 * macOS Safari steps a closed <select> with the arrow keys and with trackpad
 * scroll, firing `change` for EVERY option it passes. Navigating on the first
 * one meant stepping from the bottom option only ever moved one place before
 * the reload threw the rest away. Keep the pending value locally so the
 * control still responds instantly, and commit once the user pauses.
 *
 * (These switchers are native selects again: the macOS beta bug that anchored
 * their popup off the top of the screen — the reason SelectMenu existed, PRs
 * #38/#39 — was fixed in the OS release, and all menus now share the native
 * control. See components/ui/filter-select.tsx for the history.)
 */
const VIEW_AS_COMMIT_MS = 450;

function usePendingSelect(
  committed: string,
  /** Resolves false when the apply FAILED — the select snaps back to committed. */
  commit: (value: string) => Promise<boolean>,
) {
  const [value, setValue] = useState(committed);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // A ref, not the closure value: the snap-back fires after an async round
  // trip and must read the committed value CURRENT at that moment.
  const committedRef = useRef(committed);
  committedRef.current = committed;

  // Re-sync when the server-side value changes (a successful apply reloads
  // the SPA; a failed one resolves false below and snaps back explicitly —
  // `committed` itself never changes on failure, so an effect can't catch it).
  useEffect(() => setValue(committed), [committed]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return {
    value,
    onChange: (next: string) => {
      setValue(next);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        void commit(next).then((ok) => {
          // Snap back so the control shows the real state, and so re-picking
          // the same option fires a change event again (retry would otherwise
          // be a no-op on a native select already displaying that value).
          if (!ok) setValue(committedRef.current);
        });
      }, VIEW_AS_COMMIT_MS);
    },
  };
}

/** Admin "view as role" switcher (§7.1) — the API applies and enforces the choice. */
function RoleSwitcher({
  user,
  viewAs,
  className,
  dark,
}: {
  user: Me;
  /** AppLayout's applyViewAs owns error handling; false = failed, snap back. */
  viewAs: (change: ViewAsChange) => Promise<boolean>;
  className?: string;
  dark?: boolean;
}) {
  const select = usePendingSelect(user.viewAsRole ?? '', (next) =>
    viewAs({ role: (next || null) as RoleKey | null }),
  );
  return (
    <Select
      aria-label="View as role"
      value={select.value}
      onChange={(e) => select.onChange(e.target.value)}
      className={cn(dark && DARK_SELECT, className)}
    >
      <option value="">My access (Administrator)</option>
      {ROLE_KEYS.filter((role) => role !== 'admin').map((role) => (
        <option key={role} value={role}>
          {ROLE_NAMES[role]}
        </option>
      ))}
    </Select>
  );
}

/** Chapter switcher (§7.2) — shown only when the account may view more than one. */
function ChapterSwitcher({
  user,
  viewAs,
  className,
  dark,
}: {
  user: Me;
  /** AppLayout's applyViewAs owns error handling; false = failed, snap back. */
  viewAs: (change: ViewAsChange) => Promise<boolean>;
  className?: string;
  dark?: boolean;
}) {
  const select = usePendingSelect(user.viewChapter ?? '', (next) =>
    viewAs({ chapter: (next || null) as ChapterState | null }),
  );
  const defaultLabel = user.actualChapter
    ? `${CHAPTER_NAMES[user.actualChapter as ChapterState] ?? user.actualChapter} (default)`
    : 'All chapters';
  return (
    <Select
      aria-label="Viewing chapter"
      value={select.value}
      onChange={(e) => select.onChange(e.target.value)}
      className={cn(dark && DARK_SELECT, className)}
    >
      <option value="">{defaultLabel}</option>
      {(user.allowedChapters ?? CHAPTER_STATES)
        .filter((state) => state !== user.actualChapter)
        .map((state) => (
          <option key={state} value={state}>
            {CHAPTER_NAMES[state as ChapterState] ?? state}
          </option>
        ))}
    </Select>
  );
}

export function AppLayout() {
  const { user, can, logout, viewAs } = useAuth();
  const navigate = useNavigate();
  const [navOpen, setNavOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const { pathname } = useLocation();
  const [routeAnnouncement, setRouteAnnouncement] = useState('');
  /**
   * Warn before an idle session expires. The API's clock only resets on a
   * REQUEST, so someone filling in a long form is idle as far as the server is
   * concerned — they used to find out when Save returned 401. "Stay signed in"
   * issues one request, which is exactly what extends the rolling cookie.
   */
  const idleSecondsLeft = useIdleExpiryWarning(true);
  const [keepingAlive, setKeepingAlive] = useState(false);
  const keepAlive = async () => {
    setKeepingAlive(true);
    try {
      await api.get('/auth/me');
    } catch {
      // If it has already expired, the wrapper's 401 handling takes over.
    } finally {
      setKeepingAlive(false);
    }
  };
  const isFirstRender = useRef(true);

  /**
   * Move focus to <main> after a client-side navigation. Without this, changing
   * route left focus on <body> — a keyboard user's next Tab restarted from the
   * top of the sidebar, and a screen-reader user got no indication anything had
   * happened, because an SPA route change fires none of the page-load events
   * assistive tech listens for.
   *
   * Focus moves on the PATHNAME, deliberately not when the page finishes
   * loading: the skip-link contract is that focus follows the navigation, and a
   * lazy route can take a moment. The Suspense fallback below is a role="status"
   * carrying "Loading page…", so what lands under focus announces itself
   * truthfully in the meantime.
   *
   * Skipped on first render: stealing focus on initial load is its own problem.
   */
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    mainRef.current?.focus();
  }, [pathname]);

  /**
   * Announce the page once its NAME exists, rather than when the URL changes.
   *
   * This used to read document.title inside the effect above, which was correct
   * only while every route was statically imported. With the module routes lazy,
   * the destination's PageHeader has not mounted on a first visit at pathname-
   * change time, so that read returned — and announced — the page the user had
   * just left. `useCurrentPageTitle` is published by PageHeader itself, so this
   * fires when the real title arrives however long the chunk takes.
   *
   * The first title of the session is skipped for the same reason the focus move
   * is: nothing has been navigated to yet.
   */
  const pageTitle = useCurrentPageTitle();
  const isFirstTitle = useRef(true);
  useEffect(() => {
    if (!pageTitle) return;
    if (isFirstTitle.current) {
      isFirstTitle.current = false;
      return;
    }
    setRouteAnnouncement(pageTitle);
  }, [pageTitle]);

  const [viewAsError, setViewAsError] = useState<string | null>(null);
  useRecordScreenHistory();
  // Fetches only for users holding case_management.read (hook is self-gating).
  const portalPending = usePortalRequestsPending();

  /**
   * A failed view-as call used to be swallowed (`void viewAs(...)`), so the
   * switcher silently snapped back and the user looked stuck in the preview
   * with no way out and no explanation. Surface the failure instead, and send
   * an expired session to the login screen — /auth/* is exempt from the API
   * client's global 401 redirect, so it has to be handled here.
   */
  const applyViewAs = (change: ViewAsChange): Promise<boolean> => {
    setViewAsError(null);
    return viewAs(change).then(
      () => true,
      (err: unknown) => {
        if (err instanceof ApiError && err.status === 401) {
          window.location.assign('/login');
          return true; // navigating away — nothing left to snap back
        }
        setViewAsError(
          err instanceof ApiError ? err.message : 'Could not switch view — please try again.',
        );
        // False tells usePendingSelect to snap the switcher back to the real
        // committed state, so it never displays a preview that is not active.
        return false;
      },
    );
  };

  if (!user) {
    navigate('/login');
    return null;
  }

  // A chapter preview only matters when it differs from the account's default view.
  const chapterPreview =
    user.viewChapter && user.viewChapter !== user.actualChapter
      ? (user.viewChapter as ChapterState)
      : null;
  const isRealAdmin = user.actualRoles.includes('admin');
  const chapterSwitchable = user.allowedChapters === null || user.allowedChapters.length > 1;
  const chapterLabel = user.chapter
    ? `${CHAPTER_NAMES[user.chapter as ChapterState] ?? user.chapter} chapter`
    : 'All chapters';

  return (
    <div className="flex min-h-screen">
      {/*
        First control in the document, so a keyboard user can reach page content
        in one keystroke. Without it, ~24 focusable controls — the whole sidebar,
        repeated identically on every route — sit in front of <main> on all 173
        pages, which is hundreds of wasted keystrokes over a shift of data entry.
      */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-card focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-foreground focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-ring"
      >
        Skip to main content
      </a>

      {/* Route changes are announced here. Polite, so it waits for a pause
          rather than cutting across whatever is being read. */}
      <div aria-live="polite" role="status" className="sr-only">
        {routeAnnouncement}
      </div>

      {/* Backdrop for the mobile nav drawer */}
      {navOpen ? (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={() => setNavOpen(false)}
          aria-hidden="true"
        />
      ) : null}

      {/*
        `invisible` when closed is load-bearing, not decoration. A transform
        alone left the drawer's ~24 controls — every module link, both switchers
        and Sign out — focusable and in the accessibility tree while painted off
        the left edge, so on a phone or iPad a keyboard user tabbed straight into
        an invisible menu and could hit Sign out without ever seeing focus.
        visibility:hidden removes the subtree from both. `lg:visible` keeps the
        permanent desktop sidebar unaffected.

        visibility is transitioned alongside transform on purpose: as a discrete
        property it flips at the START when becoming visible and at the END when
        becoming hidden, so the slide-in and slide-out animations both survive.
        Done in CSS rather than the `inert` attribute because this is React 18,
        where `inert={false}` still renders the attribute — and its mere presence
        makes an element inert, which would have hidden the desktop sidebar.
      */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-60 flex-col bg-navy-deep text-white transition-[transform,visibility] duration-200 lg:visible lg:translate-x-0',
          navOpen ? 'visible translate-x-0' : 'invisible -translate-x-full',
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
          {/* Below md the header hides the switchers — the drawer carries them. */}
          {isRealAdmin ? (
            <div className="mb-3 px-2 md:hidden">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-white/40">
                View as role
              </div>
              <RoleSwitcher user={user} viewAs={applyViewAs} dark className="mt-1 h-8 w-full" />
            </div>
          ) : null}
          <div className="mb-2 px-2 leading-tight">
            <div className="text-sm font-medium text-white">
              {user.firstName} {user.lastName}
            </div>
            <div className="truncate text-xs text-white/50">{user.email}</div>
            {chapterSwitchable ? (
              <>
                <ChapterSwitcher user={user} viewAs={applyViewAs} dark className="mt-1.5 h-8 w-full md:hidden" />
                <div className="mt-0.5 hidden text-[11px] font-medium text-gold md:block">
                  {chapterLabel}
                </div>
              </>
            ) : (
              <div className="mt-0.5 text-[11px] font-medium text-gold">{chapterLabel}</div>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-white/70 hover:bg-white/10 hover:text-white"
            onClick={() => {
              setNavOpen(false);
              navigate('/account');
            }}
          >
            <UserRound className="h-4 w-4" /> My account
          </Button>
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
          {/* In the sticky stack rather than fixed over it: a fixed banner
              covered the header's own controls. Solid warning fill, because
              amber text on a 10% amber tint measures 3.97:1 — below AA. */}
          {idleSecondsLeft !== null ? (
            <div
              role="alert"
              className="flex flex-wrap items-center gap-2.5 border-b border-warning-foreground/30 bg-warning px-4 py-2 text-sm text-warning-foreground sm:px-6"
            >
              <Clock className="h-4 w-4 shrink-0" />
              <span className="min-w-0">
                <span className="font-semibold">
                  Your session expires in about {Math.max(1, Math.ceil(idleSecondsLeft / 60))}{' '}
                  minute{Math.ceil(idleSecondsLeft / 60) === 1 ? '' : 's'}.
                </span>{' '}
                <span className="hidden sm:inline">Anything unsaved would be lost.</span>
              </span>
              <button
                type="button"
                onClick={keepAlive}
                disabled={keepingAlive}
                /* Ring in the light foreground, not --ring: the gold ring is
                   itself amber and would vanish against this fill. */
                className="ml-auto shrink-0 rounded-md border border-warning-foreground/40 px-2.5 py-1 text-xs font-semibold hover:bg-warning-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warning-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-warning disabled:opacity-70"
              >
                {keepingAlive ? 'Staying signed in…' : 'Stay signed in'}
              </button>
            </div>
          ) : null}
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
                onClick={() => void applyViewAs({ role: null, chapter: null })}
                className="ml-auto shrink-0 rounded-md border border-navy-ink/30 px-2.5 py-1 text-xs font-semibold hover:bg-navy-ink/10"
              >
                Exit preview
              </button>
            </div>
          ) : null}
          {/* Opaque, NOT backdrop-blur: a backdrop-filter ancestor composites
              its subtree and WebKit then mis-hit-tests the native <select>
              popups this header holds (the role/chapter switchers), so the
              control only responded near its arrow. */}
          <header className="flex h-14 items-center gap-3 border-b bg-background px-4 sm:px-6">
            <button
              type="button"
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground lg:hidden"
              onClick={() => setNavOpen(true)}
              aria-label="Open navigation"
            >
              <Menu className="h-5 w-5" />
            </button>
            <GlobalSearch />
            {/* View-as switchers: top right on every page (drawer carries them below md). */}
            {isRealAdmin || chapterSwitchable ? (
              <div className="ml-auto hidden shrink-0 items-center gap-2 md:flex">
                {isRealAdmin ? <RoleSwitcher user={user} viewAs={applyViewAs} className="w-52" /> : null}
                {chapterSwitchable ? (
                  <ChapterSwitcher user={user} viewAs={applyViewAs} className="w-44" />
                ) : null}
              </div>
            ) : null}
          </header>
          {viewAsError ? (
            <div
              role="alert"
              className="flex items-center gap-2 border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive sm:px-6"
            >
              <span className="min-w-0">{viewAsError}</span>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="ml-auto shrink-0 rounded-md border border-destructive/40 px-2.5 py-1 text-xs font-semibold hover:bg-destructive/10"
              >
                Reload
              </button>
            </div>
          ) : null}
        </div>
        {/* tabIndex={-1} so the skip link can move focus here without making
            <main> itself a tab stop. */}
        {/*
            A measure, not a stretch. At 1920px the participants table ran to
            1,630px, so the eye travelled that far from a name to its status —
            and the audit measured 2,270px on a wider display. Capping the
            content column keeps a row scannable and leaves the widest tables
            their own horizontal scroll, which is a smaller ask than reading
            across two feet of screen.

            On the container rather than the table, because a full-width toolbar
            above a narrower table reads as a bug.
        */}
        <main
          ref={mainRef}
          id="main-content"
          tabIndex={-1}
          className="mx-auto w-full max-w-screen-2xl flex-1 p-4 outline-none sm:p-6"
        >
          {/* Inside <main>, so a failed screen leaves the sidebar, header and
              chapter switcher alive — a user can navigate out instead of
              reloading. It resets itself on pathname change.

              It sits OUTSIDE the Suspense on purpose: a lazy chunk that fails to
              load (the stale-tab-after-deploy case this boundary already knows
              how to recover from) throws where Suspense cannot help. */}
          <ErrorBoundary>
            {/* ONE boundary for all 20 module routes and the catch-all. It
                cannot go around moduleRoutes, which is a fragment of <Route>
                elements — react-router rejects any other child of <Routes>.

                If react-router's v7_startTransition flag is ever enabled in
                main.tsx, this fallback stops showing: React 18 keeps the OLD
                screen up during the transition instead, which reads as a dead
                click on a slow chunk. Re-measure the loading UX if that lands. */}
            <Suspense fallback={<PageLoader label="Loading page…" />}>
              <Outlet />
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
