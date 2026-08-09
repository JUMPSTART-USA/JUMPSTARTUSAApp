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

## Mobile rules
- Toolbars wrap (`ListToolbar` handles it); search is full-width under `sm`.
- Dialogs become bottom sheets automatically; keep footers in `DialogFooter`.
- Tables scroll horizontally inside their own border — never the page body.
- Touch targets ≥ 36px (`h-9`); don't shrink primary actions to `size="sm"`.
