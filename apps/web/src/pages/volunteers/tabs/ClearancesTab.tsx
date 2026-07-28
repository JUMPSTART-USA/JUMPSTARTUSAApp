import { zodResolver } from '@hookform/resolvers/zod';
import { CLEARANCE_STATUSES, volunteerClearanceSchema, type ClearanceStatus } from '@jumpstart/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { FormField } from '@/components/FormField';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input, Select, Textarea } from '@/components/ui/input';
import { EmptyState, ErrorState, PageLoader } from '@/components/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api, qs, type Paged } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDate, humanize } from '@/lib/utils';
import { applyApiFormErrors, ErrorNotice, ExpiryBadge, toDateInput } from '../shared';
import type { ClearanceRow, RequirementRow } from '../types';

export function ClearancesTab({ volunteerProfileId }: { volunteerProfileId: string }) {
  const { can } = useAuth();
  const [editing, setEditing] = useState<ClearanceRow | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['volunteers', 'clearances', volunteerProfileId],
    queryFn: () =>
      api.get<Paged<ClearanceRow>>(
        `/volunteers/clearances${qs({ volunteerProfileId, pageSize: 200 })}`,
      ),
  });

  if (isLoading) return <PageLoader />;
  if (error) return <ErrorState error={error} />;

  const clearances = data?.items ?? [];

  // §6.6: eligibility is per-institution — group the volunteer's clearances
  // by the requirement's facility.
  const groups = new Map<string, { name: string; rows: ClearanceRow[] }>();
  for (const row of clearances) {
    const inst = row.requirement.institution;
    const group = groups.get(inst.id) ?? { name: inst.name, rows: [] };
    group.rows.push(row);
    groups.set(inst.id, group);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        {can('volunteers.create') ? (
          <Button
            size="sm"
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> Record clearance
          </Button>
        ) : null}
      </div>

      {groups.size === 0 ? (
        <EmptyState
          title="No clearances recorded"
          hint="Clearances track this volunteer's standing against each facility's requirements."
        />
      ) : (
        Array.from(groups.entries()).map(([institutionId, group]) => (
          <Card key={institutionId}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{group.name}</CardTitle>
            </CardHeader>
            <CardContent className="p-0 pb-2">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Requirement</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Issued</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {group.rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <span className="font-medium">{row.requirement.name}</span>
                        {row.requirement.hardBlock ? (
                          <Badge variant="destructive" className="ml-2">
                            Hard block
                          </Badge>
                        ) : null}
                      </TableCell>
                      <TableCell>{humanize(row.requirement.requirementType)}</TableCell>
                      <TableCell>
                        <StatusBadge status={row.status} />
                      </TableCell>
                      <TableCell>{formatDate(row.issuedAt)}</TableCell>
                      <TableCell>
                        <ExpiryBadge date={row.expiresAt} />
                      </TableCell>
                      <TableCell className="text-right">
                        {can('volunteers.update') || can('volunteers.create') ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setEditing(row);
                              setDialogOpen(true);
                            }}
                          >
                            Update
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ))
      )}

      <ClearanceDialog
        volunteerProfileId={volunteerProfileId}
        clearance={editing}
        open={dialogOpen}
        onOpenChange={(next) => {
          setDialogOpen(next);
          if (!next) setEditing(null);
        }}
      />
    </div>
  );
}

interface ClearanceFormValues {
  volunteerProfileId: string;
  requirementId: string;
  status: ClearanceStatus;
  issuedAt?: string;
  expiresAt?: string;
  notes?: string;
}

const clearanceResolver =
  zodResolver(volunteerClearanceSchema) as unknown as Resolver<ClearanceFormValues>;

function ClearanceDialog({
  volunteerProfileId,
  clearance,
  open,
  onOpenChange,
}: {
  volunteerProfileId: string;
  clearance: ClearanceRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [topError, setTopError] = useState<string | null>(null);
  const [institutionFilter, setInstitutionFilter] = useState('');

  // Requirements to choose from — the volunteers module owns this list.
  const { data: requirements } = useQuery({
    queryKey: ['volunteers', 'requirements', 'lookup', institutionFilter],
    queryFn: () =>
      api.get<Paged<RequirementRow>>(
        `/volunteers/facility-requirements${qs({
          pageSize: 200,
          active: true,
          institutionId: institutionFilter || undefined,
        })}`,
      ),
    enabled: open,
  });
  const requirementItems = requirements?.items ?? [];

  const institutions = new Map<string, string>();
  for (const r of requirementItems) {
    if (r.institution) institutions.set(r.institution.id, r.institution.name);
  }

  const form = useForm<ClearanceFormValues>({
    resolver: clearanceResolver,
    values: {
      volunteerProfileId,
      requirementId: clearance?.requirementId ?? '',
      status: clearance?.status ?? 'pending',
      issuedAt: toDateInput(clearance?.issuedAt),
      expiresAt: toDateInput(clearance?.expiresAt),
      notes: clearance?.notes ?? '',
    },
  });

  // POST is an upsert on volunteer × requirement — re-recording a renewal
  // updates the existing row (no 409).
  const save = useMutation({
    mutationFn: (payload: ClearanceFormValues) => api.post('/volunteers/clearances', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['volunteers'] });
      setTopError(null);
      onOpenChange(false);
    },
    onError: (err) => setTopError(applyApiFormErrors(err, form.setError)),
  });

  const onSubmit = form.handleSubmit((data) => {
    setTopError(null);
    save.mutate(data);
  });

  const { register, formState } = form;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{clearance ? 'Update clearance' : 'Record clearance'}</DialogTitle>
          <DialogDescription>
            Recording again for the same requirement updates the existing clearance (renewals).
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          {clearance ? (
            <p className="text-sm">
              <span className="font-medium">{clearance.requirement.name}</span>
              <span className="text-muted-foreground">
                {' '}
                at {clearance.requirement.institution.name}
              </span>
            </p>
          ) : (
            <>
              <FormField label="Filter by institution">
                <Select
                  value={institutionFilter}
                  onChange={(e) => setInstitutionFilter(e.target.value)}
                >
                  <option value="">All institutions</option>
                  {Array.from(institutions.entries()).map(([id, name]) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Requirement" required error={formState.errors.requirementId}>
                <Select {...register('requirementId')}>
                  <option value="">Select a requirement…</option>
                  {requirementItems.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.institution ? `${r.institution.name} — ` : ''}
                      {r.name}
                    </option>
                  ))}
                </Select>
              </FormField>
            </>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="Status" error={formState.errors.status}>
              <Select {...register('status')}>
                {CLEARANCE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {humanize(s)}
                  </option>
                ))}
              </Select>
            </FormField>
            <div />
            <FormField label="Issued" error={formState.errors.issuedAt}>
              <Input type="date" {...register('issuedAt')} />
            </FormField>
            <FormField
              label="Expires"
              error={formState.errors.expiresAt}
              hint="Leave blank if it never expires"
            >
              <Input type="date" {...register('expiresAt')} />
            </FormField>
          </div>
          <FormField label="Notes" error={formState.errors.notes}>
            <Textarea rows={2} {...register('notes')} />
          </FormField>

          {topError ? <ErrorNotice>{topError}</ErrorNotice> : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? 'Saving…' : clearance ? 'Save changes' : 'Record clearance'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
