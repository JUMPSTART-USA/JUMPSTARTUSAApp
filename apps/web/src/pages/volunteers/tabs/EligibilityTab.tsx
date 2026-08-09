import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, XCircle } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Select } from '@/components/ui/input';
import { Notice } from '@/components/ui/notice';
import { EmptyState, ErrorState, PageLoader } from '@/components/ui/spinner';
import { api, qs, type Paged } from '@/lib/api';
import { formatDate, humanize } from '@/lib/utils';
import { useInstitutionsLookup } from '../lookups';
import type { EligibilityResult, RequirementRow } from '../types';

/**
 * §6.6: eligibility is computed, never stored — eligible at institution X iff
 * every active requirement of X is satisfied and unexpired. The endpoint
 * returns only what's missing; the requirements list fills in the green rows.
 */
export function EligibilityTab({ volunteerProfileId }: { volunteerProfileId: string }) {
  const [institutionId, setInstitutionId] = useState('');
  const institutions = useInstitutionsLookup();

  const eligibility = useQuery({
    queryKey: ['volunteers', 'eligibility', volunteerProfileId, institutionId],
    queryFn: () =>
      api.get<EligibilityResult>(
        `/volunteers/${volunteerProfileId}/eligibility${qs({ institutionId })}`,
      ),
    enabled: Boolean(institutionId),
  });

  const requirements = useQuery({
    queryKey: ['volunteers', 'requirements', 'lookup', institutionId],
    queryFn: () =>
      api.get<Paged<RequirementRow>>(
        `/volunteers/facility-requirements${qs({ institutionId, active: true, pageSize: 200 })}`,
      ),
    enabled: Boolean(institutionId),
  });

  const missing = eligibility.data?.missing ?? [];
  const missingById = new Map(missing.map((m) => [m.requirement.id, m]));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select
          aria-label="Institution"
          className="w-full sm:w-72"
          value={institutionId}
          onChange={(e) => setInstitutionId(e.target.value)}
        >
          <option value="">Select an institution…</option>
          {institutions.items.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </Select>
        {!institutions.allowed ? (
          <span className="text-sm text-muted-foreground">
            No permission to list institutions
          </span>
        ) : null}
      </div>

      {!institutionId ? (
        <EmptyState
          title="Pick an institution"
          hint="Eligibility is checked against that facility's active clearance requirements."
        />
      ) : eligibility.isLoading || requirements.isLoading ? (
        <PageLoader />
      ) : eligibility.error ? (
        <ErrorState error={eligibility.error} />
      ) : eligibility.data ? (
        <div className="space-y-3">
          {eligibility.data.eligible ? (
            <Notice variant="success">
              Eligible — every active requirement is satisfied and unexpired.
            </Notice>
          ) : (
            <Notice variant="error">
              Not eligible — {missing.length} requirement{missing.length === 1 ? '' : 's'} unmet.
            </Notice>
          )}

          <Card>
            <CardContent className="divide-y p-0">
              {(requirements.data?.items ?? []).map((req) => {
                const miss = missingById.get(req.id);
                return (
                  <div key={req.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <div className="flex items-center gap-2.5">
                      {miss ? (
                        <XCircle className="h-5 w-5 shrink-0 text-destructive" />
                      ) : (
                        <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />
                      )}
                      <div>
                        <div className="text-sm font-medium">{req.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {humanize(req.requirementType)}
                          {req.renewalMonths ? ` · renews every ${req.renewalMonths} mo` : ''}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      {miss ? (
                        <>
                          <span className="text-destructive">
                            {humanize(miss.status)}
                            {miss.expiresAt ? ` ${formatDate(miss.expiresAt)}` : ''}
                          </span>
                          {req.hardBlock ? (
                            <Badge variant="destructive">Hard block</Badge>
                          ) : (
                            <Badge variant="warning">Override allowed</Badge>
                          )}
                        </>
                      ) : (
                        <span className="text-success">Satisfied</span>
                      )}
                    </div>
                  </div>
                );
              })}
              {(requirements.data?.items ?? []).length === 0 ? (
                <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                  This institution has no active clearance requirements — all volunteers are
                  eligible.
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
