import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorState } from '@/components/ui/spinner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { AlumniUpdatesTab } from './AlumniUpdatesTab';
import { ReferralsTab } from './ReferralsTab';
import { VolunteerApplicationsTab } from './VolunteerApplicationsTab';
import { SLA_DAYS, type IntakeSummary } from './types';

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
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
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
  const [tab, setTab] = useState('volunteer-applications');

  const summary = useQuery({
    queryKey: ['intake', 'summary'],
    queryFn: () => api.get<IntakeSummary>('/intake/summary'),
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Intake Queues</h1>

      {summary.isError ? (
        <ErrorState error={summary.error} />
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

      <Tabs value={tab} onValueChange={setTab}>
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
