import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { EmptyState } from '@/components/ui/spinner';
import { formatMoney } from '@/lib/utils';

export interface DashboardCampaign {
  id: string;
  name: string;
  goalAmount: number | null;
  raisedToDate: number;
  startDate: string | null;
  endDate: string | null;
}

interface CampaignRow {
  id: string;
  name: string;
  raised: number;
  /** Remaining to goal — 0 when no goal is set or the goal is exceeded. */
  remaining: number;
  goal: number | null;
}

// Single sequential hue (app primary) + a neutral track — raised vs remaining
// is progress toward a limit, not two competing series.
const RAISED_FILL = 'hsl(var(--primary))';
const TRACK_FILL = 'hsl(var(--muted))';
const SURFACE = 'hsl(var(--card))';
const INK_MUTED = 'hsl(var(--muted-foreground))';
const GRID = 'hsl(var(--border))';

function compactMoney(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
  return `$${Math.round(value)}`;
}

function truncate(name: string): string {
  return name.length > 20 ? `${name.slice(0, 19)}…` : name;
}

function CampaignTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: CampaignRow }>;
}) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  const pct = row.goal ? Math.round((row.raised / row.goal) * 100) : null;
  return (
    <div className="rounded-md border bg-card px-3 py-2 text-xs shadow-sm">
      <div className="mb-1 font-medium text-foreground">{row.name}</div>
      <div className="text-muted-foreground">
        Raised to date: <span className="font-medium text-foreground">{formatMoney(row.raised)}</span>
      </div>
      {row.goal !== null ? (
        <div className="text-muted-foreground">
          Goal: <span className="font-medium text-foreground">{formatMoney(row.goal)}</span>
          {pct !== null ? ` (${pct}%)` : null}
        </div>
      ) : (
        <div className="text-muted-foreground">No goal set</div>
      )}
    </div>
  );
}

export function CampaignProgressChart({ campaigns }: { campaigns: DashboardCampaign[] }) {
  if (campaigns.length === 0) {
    return <EmptyState title="No active campaigns" hint="Campaign progress appears here once a campaign is active." />;
  }

  const rows: CampaignRow[] = campaigns.map((c) => ({
    id: c.id,
    name: c.name,
    raised: c.raisedToDate,
    remaining: c.goalAmount !== null ? Math.max(c.goalAmount - c.raisedToDate, 0) : 0,
    goal: c.goalAmount,
  }));

  // Height grows with campaign count so the x-axis band is never clipped.
  const height = rows.length * 44 + 36;

  return (
    <div>
      <div className="mb-3 flex items-center gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-primary" /> Raised to date
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm border bg-muted" /> Remaining to goal
        </span>
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid horizontal={false} stroke={GRID} />
          <XAxis
            type="number"
            tickFormatter={(v: number) => compactMoney(v)}
            tick={{ fontSize: 11, fill: INK_MUTED }}
            axisLine={{ stroke: GRID }}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={140}
            tickFormatter={truncate}
            tick={{ fontSize: 11, fill: INK_MUTED }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<CampaignTooltip />} cursor={{ fill: 'hsl(var(--accent))', opacity: 0.4 }} />
          <Bar dataKey="raised" stackId="progress" fill={RAISED_FILL} barSize={16} stroke={SURFACE} strokeWidth={2} />
          <Bar
            dataKey="remaining"
            stackId="progress"
            fill={TRACK_FILL}
            barSize={16}
            stroke={SURFACE}
            strokeWidth={2}
            radius={[0, 4, 4, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
      {/* Table-view twin: every value readable without hovering the chart. */}
      <ul className="mt-3 space-y-1 border-t pt-3">
        {rows.map((row) => (
          <li key={row.id} className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <span className="truncate">{row.name}</span>
            <span className="whitespace-nowrap tabular-nums">
              {formatMoney(row.raised)}
              {row.goal
                ? ` of ${formatMoney(row.goal)} (${Math.round((row.raised / row.goal) * 100)}%)`
                : ' · no goal set'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
