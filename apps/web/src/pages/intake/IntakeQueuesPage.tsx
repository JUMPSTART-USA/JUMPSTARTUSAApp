import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { ErrorState } from '@/components/ui/spinner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { P, useListParams } from '@/lib/list-params';
import { AlumniUpdatesTab } from './AlumniUpdatesTab';
import { ReferralsTab } from './ReferralsTab';
import { VolunteerApplicationsTab } from './VolunteerApplicationsTab';
import { SLA_DAYS, type IntakeSummary } from './types';
import { BackLink } from '@/components/BackLink';

function SummaryCard({
  title,
  summary,
}: {
  title: string;
  summary: IntakeSummary[keyof IntakeSummary] | undefined;
}) {
  const pending = (summary?.byStatus['pending'] ?? 0) + (summary?.byStatus['in_review'] ?? 0);
  const age = summary?.oldestPendingAgeDays ?? null;
  const breached = age !== null && age > SLA_DAYS;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{title}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-1">
        <div className="text-3xl font-semibold">{pending}</div>
        <p className="text-sm text-muted-foreground">
          awaiting review
          {age !== null ? (
            <>
              {' · oldest '}
              {breached ? (
                <Badge variant="warning">{age}d</Badge>
              ) : (
                <span>{age}d</span>
              )}
            </>
          ) : null}
        </p>
      </CardContent>
    </Card>
  );
}

/**
 * §6.11 intake queues. The referrals tab holds third-party PII about
 * justice-involved people, so it renders only with referral_inbox.read — the
 * summary card is counts-only and safe for everyone with intake_queues.read.
 */
export function IntakeQueuesPage() {
  const { can } = useAuth();
  const canSeeReferrals = can('referral_inbox.read');
  /**
   * ?tab= drives it, and it has to: the three queues below keep their filters and
   * page in the URL under their own namespaces, so a restored ?refs.page=2 on a
   * strip that silently reset would hold page 2 of a queue Radix has not mounted.
   *
   * Both the values and the default are permission-dependent — a user without
   * referral_inbox.read never renders that trigger — so the allowed SET narrows
   * too. A ?tab=referrals link shared by a colleague who can see it falls back to
   * volunteer-applications rather than selecting a trigger that is not on the page.
   */
  const tabValues = canSeeReferrals
    ? (['volunteer-applications', 'referrals', 'alumni-updates'] as const)
    : (['volunteer-applications', 'alumni-updates'] as const);
  const { values: tabParam, set: setTabParam } = useListParams({
    tab: P.choice(tabValues, 'volunteer-applications'),
  });
  const tab = tabParam.tab || 'volunteer-applications';

  const summary = useQuery({
    queryKey: ['intake', 'summary'],
    queryFn: () => api.get<IntakeSummary>('/intake/summary'),
  });

  return (
    <div className="space-y-4">
      <BackLink stateOnly />
      <PageHeader title="Intake Queues" />

      {summary.isError ? (
        <ErrorState error={summary.error} onRetry={summary.refetch} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-3">
          <SummaryCard
            title="Volunteer applications"
            summary={summary.data?.volunteerApplications}
          />
          <SummaryCard title="Referrals" summary={summary.data?.referrals} />
          <SummaryCard title="Alumni updates" summary={summary.data?.alumniUpdates} />
        </div>
      )}

      <Tabs
        value={tab}
        onValueChange={(next) => setTabParam('tab', next as (typeof tabValues)[number])}
      >
        <TabsList>
          <TabsTrigger value="volunteer-applications">Volunteer Applications</TabsTrigger>
          {canSeeReferrals ? <TabsTrigger value="referrals">Referrals</TabsTrigger> : null}
          <TabsTrigger value="alumni-updates">Alumni Updates</TabsTrigger>
        </TabsList>
        <TabsContent value="volunteer-applications">
          <VolunteerApplicationsTab />
        </TabsContent>
        {canSeeReferrals ? (
          <TabsContent value="referrals">
            <ReferralsTab />
          </TabsContent>
        ) : null}
        <TabsContent value="alumni-updates">
          <AlumniUpdatesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
