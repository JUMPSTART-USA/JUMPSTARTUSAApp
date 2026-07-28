import { zodResolver } from '@hookform/resolvers/zod';
import {
  CLEARANCE_REQUIREMENT_TYPES,
  clearanceRequirementSchema,
  type ClearanceRequirementType,
} from '@jumpstart/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus } from 'lucide-react';
import { useState } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { DataTable, initialListState, type Column, type ListState } from '@/components/DataTable';
import { FormField } from '@/components/FormField';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Checkbox, Input, Label, Select, Textarea } from '@/components/ui/input';
import { ErrorState } from '@/components/ui/spinner';
import { api, ApiError, qs, type Paged } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { humanize } from '@/lib/utils';
import { useInstitutionsLookup } from './lookups';
import { applyApiFormErrors, ErrorNotice, useDebouncedValue } from './shared';
import type { RequirementRow } from './types';

/**
 * Per-facility clearance requirements are DATA, not code — every DOC differs
 * (assumption #11). hardBlock decides enforcement: blocks assignment outright
 * vs. override with a recorded reason (§6.6).
 */
export function FacilityRequirementsPage() {
  const { can } = useAuth();
  const [listState, setListState] = useState<ListState>({ ...initialListState, sortBy: 'name' });
  const [institutionId, setInstitutionId] = useState('');
  const [active, setActive] = useState('');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<RequirementRow | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const debouncedSearch = useDebouncedValue(search);
  const institutions = useInstitutionsLookup();

  const params = {
    ...listState,
    search: debouncedSearch,
    institutionId,
    active,
  };
  const { data, isLoading, error } = useQuery({
    queryKey: ['volunteers', 'requirements', 'list', params],
    queryFn: () =>
      api.get<Paged<RequirementRow>>(`/volunteers/facility-requirements${qs(params)}`),
  });

  const columns: Column<RequirementRow>[] = [
    {
      key: 'name',
      header: 'Requirement',
      sortKey: 'name',
      render: (row) => <span className="font-medium">{row.name}</span>,
    },
    {
      key: 'institution',
      header: 'Institution',
      render: (row) => row.institution?.name ?? '—',
    },
    {
      key: 'requirementType',
      header: 'Type',
      sortKey: 'requirementType',
      render: (row) => humanize(row.requirementType),
    },
    {
      key: 'renewal',
      header: 'Renewal',
      render: (row) =>
        row.renewalMonths ? (
          `Every ${row.renewalMonths} mo`
        ) : (
          <span className="text-muted-foreground">Never expires</span>
        ),
    },
    {
      key: 'enforcement',
      header: 'Enforcement',
      render: (row) =>
        row.hardBlock ? (
          <Badge variant="destructive" title="Blocks assignment outright — cannot be overridden">
            Hard block
          </Badge>
        ) : (
          <Badge variant="warning" title="Coordinators may override with a recorded reason">
            Override allowed
          </Badge>
        ),
    },
    {
      key: 'active',
      header: 'Active',
      render: (row) =>
        row.active ? (
          <Badge variant="success">Active</Badge>
        ) : (
          <Badge variant="outline">Retired</Badge>
        ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            to="/volunteers"
            title="Back to volunteers"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-accent"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-xl font-semibold">Facility clearance requirements</h1>
            <p className="text-sm text-muted-foreground">
              Each institution's requirements as data — hard block prevents assignment outright;
              otherwise coordinators may override with a reason.
            </p>
          </div>
        </div>
        {can('volunteers.create') ? (
          <Button
            size="sm"
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> New requirement
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select
          className="w-64"
          value={institutionId}
          onChange={(e) => {
            setInstitutionId(e.target.value);
            setListState((s) => ({ ...s, page: 1 }));
          }}
        >
          <option value="">All institutions</option>
          {institutions.items.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </Select>
        <Select
          className="w-40"
          value={active}
          onChange={(e) => {
            setActive(e.target.value);
            setListState((s) => ({ ...s, page: 1 }));
          }}
        >
          <option value="">Active & retired</option>
          <option value="true">Active only</option>
          <option value="false">Retired only</option>
        </Select>
        <Input
          placeholder="Search requirements…"
          className="w-64"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setListState((s) => ({ ...s, page: 1 }));
          }}
        />
      </div>

      {error ? <ErrorState error={error} /> : null}

      <DataTable
        columns={columns}
        data={data}
        isLoading={isLoading}
        state={listState}
        onStateChange={setListState}
        onRowClick={
          can('volunteers.update')
            ? (row) => {
                setEditing(row);
                setDialogOpen(true);
              }
            : undefined
        }
        emptyMessage="No clearance requirements defined"
      />

      <RequirementDialog
        requirement={editing}
        open={dialogOpen}
        onOpenChange={(next) => {
          setDialogOpen(next);
          if (!next) setEditing(null);
        }}
      />
    </div>
  );
}

interface RequirementFormValues {
  institutionId: string;
  name: string;
  requirementType: ClearanceRequirementType;
  description?: string;
  renewalMonths?: number | string;
  hardBlock: boolean;
  active: boolean;
}

const requirementResolver =
  zodResolver(clearanceRequirementSchema) as unknown as Resolver<RequirementFormValues>;

function RequirementDialog({
  requirement,
  open,
  onOpenChange,
}: {
  requirement: RequirementRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [topError, setTopError] = useState<string | null>(null);
  const institutions = useInstitutionsLookup();

  const form = useForm<RequirementFormValues>({
    resolver: requirementResolver,
    values: {
      institutionId: requirement?.institutionId ?? '',
      name: requirement?.name ?? '',
      requirementType: requirement?.requirementType ?? 'background_check',
      description: requirement?.description ?? '',
      renewalMonths: requirement?.renewalMonths ?? '',
      hardBlock: requirement?.hardBlock ?? false,
      active: requirement?.active ?? true,
    },
  });

  const save = useMutation({
    mutationFn: (payload: RequirementFormValues) =>
      requirement
        ? api.patch(`/volunteers/facility-requirements/${requirement.id}`, payload)
        : api.post('/volunteers/facility-requirements', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['volunteers'] });
      setTopError(null);
      onOpenChange(false);
    },
    onError: (err) => setTopError(applyApiFormErrors(err, form.setError)),
  });

  const remove = useMutation({
    mutationFn: () => api.delete(`/volunteers/facility-requirements/${requirement!.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['volunteers'] });
      setTopError(null);
      onOpenChange(false);
    },
    // 409: requirement has recorded clearances — retire instead. Show it.
    onError: (err) =>
      setTopError(err instanceof ApiError ? err.message : 'Delete failed'),
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
          <DialogTitle>{requirement ? 'Edit requirement' : 'New clearance requirement'}</DialogTitle>
          <DialogDescription>
            Hard block: blocks assignment outright. Otherwise coordinators may override with a
            recorded reason (§6.6).
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <FormField
            label="Institution"
            required
            error={formState.errors.institutionId}
            hint={!institutions.allowed ? 'No permission to list institutions' : undefined}
          >
            <Select {...register('institutionId')} disabled={Boolean(requirement)}>
              <option value="">Select an institution…</option>
              {institutions.items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Name" required error={formState.errors.name}>
            <Input
              {...register('name')}
              placeholder='e.g. "DOC volunteer application", "TB test"'
            />
          </FormField>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="Type" error={formState.errors.requirementType}>
              <Select {...register('requirementType')}>
                {CLEARANCE_REQUIREMENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {humanize(t)}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField
              label="Renewal (months)"
              error={formState.errors.renewalMonths}
              hint="Blank = never expires"
            >
              <Input
                type="number"
                min={1}
                {...register('renewalMonths', {
                  setValueAs: (v) => (v === '' ? undefined : v),
                })}
              />
            </FormField>
          </div>
          <FormField label="Description" error={formState.errors.description}>
            <Textarea rows={2} {...register('description')} />
          </FormField>
          <div className="space-y-2 rounded-md border px-3 py-2">
            <div className="flex items-center gap-2">
              <Checkbox id="req-hard-block" {...register('hardBlock')} />
              <Label htmlFor="req-hard-block">
                Hard block — un-cleared volunteers cannot be assigned at all (no override)
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="req-active" {...register('active')} />
              <Label htmlFor="req-active">
                Active — retire instead of deleting once clearances reference it
              </Label>
            </div>
          </div>

          {topError ? <ErrorNotice>{topError}</ErrorNotice> : null}

          <DialogFooter className="justify-between sm:justify-between">
            <div>
              {requirement && can('volunteers.delete') ? (
                <Button
                  variant="destructive"
                  disabled={remove.isPending}
                  onClick={() => {
                    if (window.confirm(`Delete requirement "${requirement.name}"?`)) {
                      remove.mutate();
                    }
                  }}
                >
                  {remove.isPending ? 'Deleting…' : 'Delete'}
                </Button>
              ) : null}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={save.isPending}>
                {save.isPending ? 'Saving…' : requirement ? 'Save changes' : 'Create requirement'}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
