# JUMPSTART USA UI Kit

Design system for the operations platform. Palette comes from jumpstartsc.org's
own brand variables: gold `#FDB835` / `#F3C745`, navy `#0F2346`, ink `#07121C`,
cream `#FEF6E3`, dusty blue `#88AAC6`, warm neutrals. Direction: airy warm-white
surfaces, **navy for actions**, **gold for brand moments** (active nav, focus
ring, login CTA), real status tokens, mobile-first.

## Tokens (`src/index.css` + `tailwind.config.ts`)

- Semantic: `background, foreground, card, primary (navy), secondary, muted,
  accent (cream hover tint), destructive, success, warning, info, gold, border,
  input, ring (gold)`. Use `bg-success/10 text-success border-success/20` style
  tints — **never raw Tailwind palette classes** (`bg-amber-50`, `text-emerald-600`,
  `bg-sky-100`, `bg-red-50`, …).
- Brand hexes only where semantics don't fit: `navy`, `navy-deep`, `navy-ink`,
  `navy-slate`, `navy-light`, `gold-alt`, `gold-dark`, `gold-soft`, `cream`.
- Radius: `--radius: 0.5rem`; cards use `rounded-xl`, controls `rounded-md`.
- Shadows: `shadow-card` (cards/tables), `shadow-overlay` (dialogs/popovers).
- Type: IBM Plex Sans; h1–h3 render in IBM Plex Sans Condensed globally.

## Components

### Layout & structure
| Component | Import | Use |
|---|---|---|
| `PageHeader` | `@/components/ui/page-header` | Top of EVERY page: `title`, `description?`, `actions?`. Never hand-roll an `<h1>`. |
| `SectionHeader` | same | `<h2>` sections below the header. |
| `SubNav` | `@/components/ui/sub-nav` | Module sub-navigation (admin, case mgmt, mentoring, donors): `items=[{to,label,end?}]`. |
| `Card, CardHeader, CardHeaderRow, CardTitle, CardDescription, CardContent, CardFooter` | `@/components/ui/card` | `CardTitle` is `text-base` — do not override its size. Use `CardHeaderRow` for title+actions rows instead of flex overrides on `CardHeader`. |
| `DescriptionList, InfoItem` | `@/components/ui/description-list` | Read-only label+value facts on detail screens. Replaces InfoItem/DetailRow/Row copies. |

### Lists (the standard list page)
```tsx
<div className="space-y-4">
  <PageHeader title="Volunteers" actions={<Button onClick={…}><Plus className="h-4 w-4" /> New volunteer</Button>} />
  <ListToolbar>
    <SearchInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search volunteers…" />
    <Select className="w-full sm:w-44">…</Select>
  </ListToolbar>
  <DataTable … />
</div>
```
- `ListToolbar, ToolbarSpacer, SearchInput` from `@/components/ui/toolbar`.
- Primary create action lives in `PageHeader actions`, default size (`<Button>`,
  not `size="sm"`), icon `<Plus className="h-4 w-4" />`, label `New <thing>`.
- Filter selects: `className="w-full sm:w-44"` (or `sm:w-56` for long option text).
- Page sections stack with `space-y-4`.

### Forms & dialogs
| Component | Import | Use |
|---|---|---|
| `Dialog, DialogContent size="sm|md|lg|xl|2xl"` | `@/components/ui/dialog` | Width by size prop only — never `className="max-w-*"`. sm=confirm, md=short form (default), lg=most forms, xl=two-column forms, 2xl=wide pickers/tables. Mobile renders as a bottom sheet automatically. |
| `FormField` | `@/components/FormField` | Every labeled control. |
| `FormError` | `@/components/ui/notice` | Top-of-form error: `<FormError message={topError} />`. Replaces bare `<p className="text-sm text-destructive">`, `ErrorState(new Error(...))`, ErrorNotice, FormErrorNotice. |
| `Notice` | `@/components/ui/notice` | Inline callouts: `variant="error|warning|success|info"`, optional `title`. Replaces WarningNotice/AmberNotice. |
| `ConfirmDialog` | `@/components/ui/confirm-dialog` | ALL destructive confirmations. Replaces `window.confirm`, module ConfirmDialogs, bespoke delete `<Dialog>`s. Props: `open, onOpenChange, title, description?, confirmLabel?, destructive?, isPending?, error?, onConfirm`. |
| `EntityPicker` | `@/components/ui/entity-picker` | Generic debounced search-and-pick. |
| `ChapterSelect` | `@/components/ChapterSelect` | Chapter (state) field on create/edit forms (§7.2): REQUIRED select over the six chapter states, rendered ONLY for all-chapters users — scoped users' records are stamped server-side. Spread `register('chapterState')` into it. |
| `ChapterFilterSelect` | `@/components/ChapterSelect` | Chapter filter in `ListToolbar`: "All chapters" + the six states, hidden for chapter-scoped users (the API force-filters them). Controlled `value`/`onChange`. |
| `FilterSelect` | `@/components/ui/filter-select` | Toolbar/page-level dropdown: native `<select>` that takes `<option>` children and hands `onChange` the VALUE, not the event. Every menu in the app is a native select — the in-page `SelectMenu` workaround (PRs #38/#39) existed for a macOS beta bug that anchored native popups off-screen for controls near the top of the window; the OS fix shipped and the component was removed. Do not re-add an in-page listbox without re-measuring the OS behaviour (history in filter-select.tsx). |
| `ParticipantPicker, VolunteerPicker` | `@/components/pickers` | Standard pickers (`value`/`onChange` with `{id,label,sublabel?}`). Replace all module-local pickers. |

Form grids: `grid gap-4 sm:grid-cols-2` (never 2 columns on mobile).
Pending copy: submit buttons show `Saving…` (`Deleting…`/`Sending…` only when
genuinely different). Idle labels: `Save` (edit), `Create` (new), `Delete`.

**Phone fields**: always `PhoneInput` from `@/components/ui/phone-input` —
auto-formats to XXX-XXX-XXXX while typing; the shared `optionalPhone` schema
normalizes and validates the same format server-side. Never a bare `Input`
for phone numbers.

**Date fields**: always `<Input type="date">` (native picker validates and
renders MM/DD/YYYY in US locales). Event dates ("when did this happen":
service/note/session dates, move-ins, check-ins) default to `todayInput()`.
Never default dates of birth, releases, or expirations.

### Form helpers — `@/lib/form` (canonical, delete module copies)
- `useDebounced(value, delay=300)` — replaces every module `useDebounced`/`useDebouncedValue`.
- `formResolver<T>(schema)` — zodResolver + `'' → undefined` cleaning. Replaces
  `schemaResolver`, `zodForm`, `formResolver` module copies AND raw
  `zodResolver(x) as unknown as Resolver<T>` casts.
- `applyApiError(err, setError?) => string | null` — replaces `applyApiError` /
  `applyApiFormErrors` / `applyFormErrors` / `applyApiErrors` copies. Pattern:
  `onError: (err) => setTopError(applyApiError(err, setError))`, rendered with
  `<FormError message={topError} />`.
- `toDateInput(iso)`, `todayInput()` — replace `toDateInput`/`dateInput`/
  `dateInputValue`/`todayStr` copies.

### Status & feedback
- `Badge` variants: `default, secondary, outline, gold, success, warning,
  destructive, info` — token-tinted. `StatusBadge` maps enum strings.
- `Spinner, PageLoader, EmptyState, ErrorState` from `@/components/ui/spinner`.
- Buttons: `default` (navy) for primary actions, `accent` (gold) ONLY for brand
  moments (login), `outline` secondary, `ghost` row actions, `destructive` delete.

## Naming the chapter slice

A chapter-scoped session sees the org through a slice, and for years nothing
said so where it mattered: the only always-on chapter name was an 11px sidebar
line. So "No participants found" read as "none anywhere," and the audit called
chapter scoping invisible.

**The safety rule, before the components:** every scope string is a pure
function of the SESSION (`useChapterScope()` in `lib/chapter-scope.ts`) —
decided before any request runs, blind to query results. §7.2 requires "exists
in another chapter" and "exists nowhere" to render identically, and copy that
never sees a result cannot tell them apart. Corollary: name the search's
COVERAGE ("in the South Carolina chapter"), never a cause — "in another
chapter" is forbidden everywhere, because the client does not possess that fact.

- **`ChapterScopeBadge`** renders in the exact toolbar slot where all-chapters
  users get `ChapterFilterSelect` (automatic — the select renders the chip for
  scoped sessions). Its title says "Viewing…", not "your account…": a session
  can be narrowed by an admin's chapter preview.
- **`DataTable chapterScoped`** adds "Showing the {Chapter} chapter only."
  under both empty-state branches. OPT-IN, because the flag is a claim about
  the ENDPOINT: TasksPage must never set it (case tasks include chapter-neutral
  staff to-dos from any chapter), nor org-global lists (support tickets), nor
  parent-scoped child tables. The line renders only on a RESOLVED empty —
  several pages stack ErrorState above an unconditional DataTable, and a scope
  line under an error would dress it up as a confirmed empty chapter.
- **`EntityPicker chapterScoped`** turns the zero-result row into "No matches
  in the {Chapter} chapter". Opt-in for the same reason: MergePage's picker
  searches org-wide and the household picker searches the donor's chapter.
- **GlobalSearch** names the slice in its placeholder and zero-result row, and
  now renders zero results and failures as distinct visible states — silence
  was indistinguishable from a typo, and a failed search rendering as a
  negative result is the documented duplicate-record path.
- **The report runner pins the chapter param** for scoped users: the API
  force-overwrites it (`scopeToChapter`), so the live select was the app's one
  actively lying chapter affordance — pick Georgia, silently get your own
  chapter's rows.

## Saying "you may not see this"

Three components exist to keep three pairs of things apart. Each pair rendered
identically before, and in an app holding records about justice-involved people
each collapse is a reader drawing a false conclusion about a person.

- **`NoAccess`, never `EmptyState`, for a permission denial.** Nine screens
  reported a denial through `EmptyState`, so "No access to case management"
  arrived in the same dashed box, weight and grey as "No case notes recorded" —
  a case manager reads an empty file and concludes the participant has none.
  `NoAccess` is a solid border, a filled surface and a lock; keep all three, each
  is too quiet alone. Give it a `reason` naming the permission, because the
  reader's next move is to ask someone for it. Naming a permission is not a leak
  — it describes this user's role, not whether a record exists.
- **`RedactedValue` for a value that exists and is withheld.** It renders an em
  dash like a hundred other cells, which is exactly why it is a named component
  for one call site: a mechanical sweep onto a shared "empty value" dash would
  make a redacted DOC number identical to a participant who has none. Only for
  fields the API STRIPS while keeping the row — where it omits the field or the
  record entirely, render nothing.
- **`Meter` draws a bar and has no opinion about a full one.** `tone` is required
  and there is no `>= 100` rule anywhere in it. Fundraising `ProgressBar` paints
  100% success; housing `OccupancyBar` paints a full home warning and an
  over-capacity one destructive. Sharing the geometry is safe; sharing a
  threshold is how an over-capacity transitional home turns green.

One denial deliberately stays a red `ErrorState`:
`employment/EmployerProfilePage.tsx` renders a server 403, whose comment says it
*usually* means a missing grant. "Usually" is not enough to promise the reader a
permission wall, so it keeps the error treatment until the API says which it is.

## Metrics

`StatTile` is a label above a number. `MetricCard` is a card around one. Between
them they replaced four rival KPI-tile implementations.

- **`StatTile` owns type scale and reading order and nothing else** — no border,
  background, padding, grid, alignment or heading. The containers it goes in vary
  six ways (a bordered strip inside a titled Card, the same strip on a bare page,
  a plain CardContent grid, a left-aligned CRM grid, a dialog cell, a card), so
  anything structural in it is wrong at one of them. Layout stays on the caller.
- **Label first.** A screen reader reads DOM order: "Active matches, 12" is a
  fact, "12, active matches" is a guessing game.
- **Colour is the caller's opinion, never a threshold.** There is no `tone` prop.
  Pass `flag={x > 0 ? { tone: 'warning', note: '…' } : undefined}` beside the
  quantity you are comparing. Mentoring's overdue count is bad above zero;
  housing's available beds are bad *below* zero. As two callers computing two
  booleans they cannot conflict — one shared rule would have to be wrong for one
  of them. `flag.note` is required: colour alone fails WCAG 1.4.1.
- **The only route to a tab stop is `to`.** `MetricCard`'s prop list is closed —
  no `onClick`, no `role`, no `tabIndex` — so a tile that must not be navigable
  cannot become navigable by accident. Resolve `to` with `can()` at the call
  site, and check the permission the DESTINATION ROUTE is gated on, not the one
  that produced the number: three dashboard tiles are computed under one key and
  link to a route gated on another.
- **A number the reader may see can still be a link they may not follow.** The
  intake summary shows the Referrals count to anyone with `intake_queues.read`
  while the Referrals tab needs `referral_inbox.read`. The count stays; the link
  must not exist. That is a lying link, not a leak — see the note on §7.2 below.
- **Every metric value is set in `font-display`** (IBM Plex Sans Condensed), from
  the primitive rather than per call site. It is the heading face and a stat
  value is not a heading, but it is the look the dashboard established, and one
  face for every glanceable number beats ten condensed on one screen and fifty
  in the body face everywhere else. It condenses dates too — the CRM giving
  summary's "First gift" is a `formatDate` string in a `StatTile`.
- Sizes are `sm` 18px / `md` 24px (default) / `lg` 30px. **Known remainder:** six
  tiles render at `text-xl` (20px) — `volunteers/tabs/HoursTab.tsx` and
  `crm/donors/DonationsListPage.tsx`. They are not migrated. A fourth size to
  serve six tiles would institutionalise an accident, and moving them is a visual
  change nobody has asked for; pick one deliberately rather than by drift.
  `HoursTab`'s three are also value-first with lowercase captions, which the
  label-first rule says is backwards.
- Not everything with a big number is a tile. `HomeDetailPage`'s "3 **of** 8
  beds" and `CampaignDetailPage`'s "$12,400 raised of $50,000 goal" are prose
  compositions with no label line; they stay hand-written.

## Words

- **A status becomes text through `statusLabel()`, never a bare `humanize()`.**
  A module may keep its own colours — several must — but no module gets its own
  spelling. This existed because events printed "No show" and the volunteer
  roster printed "No-show" for the same state, two clicks apart.
- **A page's `<h1>` says what the link the user clicked said.** Not a shortened
  form, not a longer one. A sub-nav pill may abbreviate where it is a prefix of
  the heading ("Recurring" → "Recurring gifts"), but it must never promise
  something the heading drops — the mentoring module was reached by clicking
  "Alumni & Mentoring" and greeted the user with "Mentoring".
- **These words are NOT synonyms, and consolidating them would be wrong.** The
  audit counted nine words for "finished" and four for "approved"; all but the
  spelling above are the domain's own vocabulary, and the API enforces the
  difference:

  | Word | Belongs to | Means, precisely |
  |---|---|---|
  | `completed` | tasks, classes, transports, placements, volunteer assignments | the work ran its course |
  | `ended` | mentor matches, volunteer assignments | it stopped — and unlike `completed`, which sits beside it in the same enum, claims nothing about how |
  | `closed` | opportunities, recurring gifts | stopped accepting new activity |
  | `archived` | opportunities, service plans | retired. Thin against `closed`: nothing in the API treats them differently and neither is hidden from a default list, so if these ever need to mean different things, decide it there first |
  | `resolved` | incidents | someone dealt with it |
  | `dismissed` | incidents | it needed no dealing with |
  | `fulfilled` | pledges | paid in full — an accounting fact |
  | `written_off` | pledges | will not be paid, and we have said so |
  | `satisfied` | clearances | a requirement was met |
  | `terminated` | employment | ended by the employer; `resigned` is the same event from the other side |
  | `approved` | travel, transport, hours, screenings, intake | a staff member said yes |
  | `confirmed` | shift signups | the volunteer said yes |
  | `clear` | background-check results | the check came back with nothing |

  Sentence case for every label except proper nouns — the Census race
  categories and brand names like "Apple Pay" keep their capitals.

## Tables

- **Numbers that are compared down a column get
  `className: 'text-right tabular-nums'` — on the `Column`, not on a `<span>`
  inside `render`.** `DataTable` spreads `col.className` onto both the header and
  the cell, so one string aligns the header with its numbers, makes `'—'`
  fallbacks tabular too, and cannot be lost when someone rewrites the render
  function. This convention existed and was applied correctly 17 times, but it
  was only ever written down here after an audit found it had never escaped the
  CRM module — 18 numeric columns elsewhere had one half of it or neither.
- **Units and ratios get `tabular-nums` but stay left-aligned.** Right-aligning
  `"45 min"` or `"3 / 8"` moves the ragged edge without aligning a single digit.
- Identifiers are not magnitudes: `participantNumber` is `font-mono`, and a count
  inside a `<Badge>` is not being compared to the row above it.
- The identifying column is pinned on small screens — `DataTable` does it from
  `linkColumnKey`, so name that column if your table does not lead with it.
- An empty table is a fork in the road: pass `isFiltered` and `onClearFilters`
  (both come straight from `useListParams`) so it can say which fork and offer
  the way back. `emptyAction` is for the genuinely-empty case.

## Cards below `sm` (opt-in per table)

`DataTable cards` renders rows as CARDS below 640px instead of a sideways-
scrolling table. Participants is the pilot; the other fifty tables keep the
pinned-column table until evidence argues otherwise — the client-error reports
carry viewports now, so "does this screen see phones" is measurable, not
guessed.

- **Opt-in, per table.** Cards win for "look one record up and open it" and
  lose for "scan a column for the outlier" — a card is ~2.5× a row's height and
  nothing lines up across rows. Which job a list's phone traffic does is a fact
  about how staff work; each table decides.
- **Columns hint their card slot** via `card: 'identity' | 'status' | 'field'
  | 'meta' | 'hidden'`. Defaults are safe without hints: the linked column is
  the identity, `actions` becomes the card footer, the next two columns are
  fields, the rest are hidden. Status cannot be guessed (it is rendered by a
  function) — until a table hints it, its badge shows as an ordinary field.
- **The status pill is for tables with ONE status domain.** Participants has
  three (Inside/Outside/Alumni), and an unlabelled pill showing one of them
  lied about most cohorts — "Completed" on an active outside-caseload member.
  The pilot renders every status as a labelled field instead; the pill carries
  a visually-hidden label from its column header either way.
- **Cards + `onRowClick`-only is the Phase 2 violation on a new surface.** A
  card's tab stop comes from `rowHref` or `onRowOpen`; a table with only
  `onRowClick` produces pointer-only cards, same as its rows. Give it a real
  destination before opting it in.
- **Page size stays 25 in card mode** — a decided default, not an oversight.
  A card is taller than a row, but the pagination footer bounds the scroll and
  a viewport-dependent page size would fork URL semantics between modes. If
  real phone traffic argues otherwise, change it deliberately.
- **The identity is the same real link/button as the table's** — Phase 2's
  keyboard guarantee, re-proven in the card markup by DataTable.cards.test.tsx.
- **Sort moves into a control above the list** (headers are gone) driving the
  same URL-backed list state, so a sort chosen on a phone survives into the
  desktop table and vice versa. Any sort change resets to page 1.
- The empty-state fork, chapter scope line, staleness dim and pagination footer
  are shared with table mode by construction — one `emptyContent`, one
  `footer` — so the two renderings cannot drift.
- Field labels repeat on every card; that is the honest cost of the format and
  the reason only two or three fields fit. Do not fight it with more fields.

## Mobile rules
- Toolbars wrap (`ListToolbar` handles it); search is full-width under `sm`.
- Dialogs become bottom sheets automatically; keep footers in `DialogFooter`.
- Tables scroll horizontally inside their own border — never the page body.
- Touch targets ≥ 36px (`h-9`); don't shrink primary actions to `size="sm"`.
