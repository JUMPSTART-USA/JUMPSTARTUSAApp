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
| `SelectMenu` | `@/components/ui/select-menu` | Dropdown that renders its menu IN THE PAGE. Use ONLY where a native `<select>` popup would be clipped — controls pinned near the top of the window, like the header's role/chapter switchers: macOS anchors the popup to the selected row, so a low selection opens it off-screen and strands the options above. Native `<Select>` remains correct for form fields in dialogs. |

`SelectMenu` positioning invariants — three things are load-bearing, each one
paid for with a WebKit bug:

1. The list is **portalled to `<body>`**. As a child of the sticky header it
   rendered in a Safari tab but was invisible in the installed (Dock) web app:
   WebKit clips an overflowing child of a composited sticky element.
2. It is positioned **`absolute` in document coordinates**
   (`getBoundingClientRect() + scrollY`), never `fixed`. A fixed element gets
   its own viewport-sized composited layer, and WebKit stops painting those once
   the window is large enough — the menu vanished above roughly 3354x2274.
3. Being document-anchored, it **closes on scroll — but only scrolls that start
   outside the list**, and the highlighted option is revealed with the list's
   own `scrollTop`, never `scrollIntoView`. `scrollIntoView` walks up to the
   nearest scrollable ancestor, which for a `<body>` portal is the page: it
   dragged the page out from under the menu and tripped close-on-scroll, so a
   menu with more options than fit shut itself as it opened.
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

## Mobile rules
- Toolbars wrap (`ListToolbar` handles it); search is full-width under `sm`.
- Dialogs become bottom sheets automatically; keep footers in `DialogFooter`.
- Tables scroll horizontally inside their own border — never the page body.
- Touch targets ≥ 36px (`h-9`); don't shrink primary actions to `size="sm"`.
