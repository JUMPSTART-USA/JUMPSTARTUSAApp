import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Circle, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { goalSchema, GOAL_STATUSES, NOTE_CATEGORIES, servicePlanSchema } from '@jumpstart/shared';
import { FormField } from '@/components/FormField';
import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { api, ApiError, qs, type Paged } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDate, humanize } from '@/lib/utils';
import {
  applyFormErrors,
  dateInputValue,
  ParticipantPicker,
  zodForm,
  type GoalRow,
  type ParticipantRef,
  type ServicePlanDetail,
  type ServicePlanRow,
} from './shared';

// goalSchema minus servicePlanId — the plan id rides in the URL.
const goalFormSchema = goalSchema.omit({ servicePlanId: true });

interface GoalFormValues {
  category: (typeof NOTE_CATEGORIES)[number];
  description: string;
  targetDate: string;
  status: (typeof GOAL_STATUSES)[number];
  notes: string;
}

function AddGoalDialog({
  planId,
  open,
  onOpenChange,
}: {
  planId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [topError, setTopError] = useState('');
  const { register, handleSubmit, setError, formState } = useForm<GoalFormValues>({
    resolver: zodForm<GoalFormValues>(goalFormSchema),
    defaultValues: {
      category: 'general',
      description: '',
      targetDate: '',
      status: 'not_started',
      notes: '',
    },
  });

  const create = useMutation({
    mutationFn: (values: GoalFormValues) => api.post(`/service-plans/${planId}/goals`, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['case-management', 'service-plan'] });
      onOpenChange(false);
    },
    onError: (err) => setTopError(applyFormErrors(err, setError)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add goal</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={handleSubmit((values) => {
            setTopError('');
            create.mutate(values);
          })}
        >
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Category" required error={formState.errors.category}>
              <Select {...register('category')}>
                {NOTE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {humanize(c)}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Target date" error={formState.errors.targetDate}>
              <Input type="date" {...register('targetDate')} />
            </FormField>
          </div>
          <FormField label="Goal" required error={formState.errors.description}>
            <Textarea rows={3} {...register('description')} />
          </FormField>
          <FormField label="Notes" error={formState.errors.notes}>
            <Textarea rows={2} {...register('notes')} />
          </FormField>
          {topError ? <p className="text-sm text-destructive">{topError}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? 'Saving…' : 'Add goal'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MilestoneList({ goal, canUpdate, canDelete }: { goal: GoalRow; canUpdate: boolean; canDelete: boolean }) {
  const queryClient = useQueryClient();
  const [newDescription, setNewDescription] = useState('');
  const [newDueDate, setNewDueDate] = useState('');
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['case-management', 'service-plan'] });

  const toggle = useMutation({
    mutationFn: (m: { id: string; completedAt: string | null }) =>
      api.post(`/service-plans/milestones/${m.id}/${m.completedAt ? 'uncomplete' : 'complete'}`),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (milestoneId: string) => api.delete(`/service-plans/milestones/${milestoneId}`),
    onSuccess: invalidate,
  });
  const add = useMutation({
    mutationFn: () =>
      api.post(`/service-plans/goals/${goal.id}/milestones`, {
        description: newDescription,
        dueDate: newDueDate || undefined,
      }),
    onSuccess: () => {
      setNewDescription('');
      setNewDueDate('');
      invalidate();
    },
  });

  const actionError = toggle.error ?? remove.error ?? add.error;

  return (
    <div className="mt-2 space-y-1.5">
      {goal.milestones.map((m) => (
        <div key={m.id} className="group flex items-center gap-2 text-sm">
          <button
            type="button"
            disabled={!canUpdate || toggle.isPending}
            onClick={() => toggle.mutate(m)}
            className="shrink-0 disabled:cursor-not-allowed"
            aria-label={m.completedAt ? 'Mark milestone incomplete' : 'Complete milestone'}
          >
            {m.completedAt ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            ) : (
              <Circle className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
          <span className={m.completedAt ? 'text-muted-foreground line-through' : ''}>
            {m.description}
          </span>
          {m.dueDate ? (
            <span className="text-xs text-muted-foreground">due {formatDate(m.dueDate)}</span>
          ) : null}
          {canDelete && !m.completedAt ? (
            <button
              type="button"
              className="ml-auto hidden text-muted-foreground hover:text-destructive group-hover:block"
              onClick={() => remove.mutate(m.id)}
              aria-label="Delete milestone"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      ))}
      {canUpdate ? (
        <form
          className="flex items-center gap-2 pt-1"
          onSubmit={(e) => {
            e.preventDefault();
            if (newDescription.trim()) add.mutate();
          }}
        >
          <Input
            className="h-8 text-xs"
            placeholder="Add milestone…"
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
          />
          <Input
            type="date"
            className="h-8 w-36 text-xs"
            value={newDueDate}
            onChange={(e) => setNewDueDate(e.target.value)}
            aria-label="Milestone due date"
          />
          <Button type="submit" size="sm" variant="outline" disabled={add.isPending || !newDescription.trim()}>
            Add
          </Button>
        </form>
      ) : null}
      {actionError ? <ErrorState error={actionError} /> : null}
    </div>
  );
}

function PlanDetail({ planId }: { planId: string }) {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [addGoalOpen, setAddGoalOpen] = useState(false);

  const { data: plan, isLoading, error } = useQuery({
    queryKey: ['case-management', 'service-plan', planId],
    queryFn: () => api.get<ServicePlanDetail>(`/service-plans/${planId}`),
  });

  const updateGoalStatus = useMutation({
    mutationFn: ({ goalId, status }: { goalId: string; status: string }) =>
      api.patch(`/service-plans/goals/${goalId}`, { status }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['case-management', 'service-plan'] }),
  });

  const updatePlanStatus = useMutation({
    mutationFn: (status: string) => api.patch(`/service-plans/${planId}`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['case-management'] }),
  });

  if (isLoading) return <PageLoader />;
  if (error) return <ErrorState error={error} />;
  if (!plan) return null;

  const canUpdate = can('case_management.update');
  const canCreate = can('case_management.create');
  const canDelete = can('case_management.delete');

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div className="space-y-1.5">
          <CardTitle className="flex items-center gap-2">
            {plan.title}
            <StatusBadge status={plan.status} />
          </CardTitle>
          <CardDescription>
            Review date: {formatDate(plan.reviewDate)}
            {plan.notes ? <> · {plan.notes}</> : null}
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          {canUpdate ? (
            <Select
              className="h-8 w-32 text-xs"
              value={plan.status}
              onChange={(e) => updatePlanStatus.mutate(e.target.value)}
              aria-label="Plan status"
            >
              {['active', 'completed', 'archived'].map((s) => (
                <option key={s} value={s}>
                  {humanize(s)}
                </option>
              ))}
            </Select>
          ) : null}
          {canCreate ? (
            <Button size="sm" onClick={() => setAddGoalOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> Add goal
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {updatePlanStatus.error ? <ErrorState error={updatePlanStatus.error} /> : null}
        {updateGoalStatus.error ? <ErrorState error={updateGoalStatus.error} /> : null}
        {plan.goals.length === 0 ? (
          <EmptyState title="No goals yet" hint="Add the first goal to build out this plan." />
        ) : (
          plan.goals.map((goal) => (
            <div key={goal.id} className="rounded-md border p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <StatusBadge status={goal.status} />
                    <span className="text-xs uppercase tracking-wide text-muted-foreground">
                      {humanize(goal.category)}
                    </span>
                    {goal.targetDate ? (
                      <span className="text-xs text-muted-foreground">
                        target {formatDate(goal.targetDate)}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm font-medium">{goal.description}</p>
                  {goal.notes ? (
                    <p className="mt-0.5 text-xs text-muted-foreground">{goal.notes}</p>
                  ) : null}
                </div>
                {canUpdate ? (
                  <Select
                    className="h-8 w-36 shrink-0 text-xs"
                    value={goal.status}
                    onChange={(e) =>
                      updateGoalStatus.mutate({ goalId: goal.id, status: e.target.value })
                    }
                    aria-label="Goal status"
                  >
                    {GOAL_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {humanize(s)}
                      </option>
                    ))}
                  </Select>
                ) : null}
              </div>
              <MilestoneList goal={goal} canUpdate={canUpdate} canDelete={canDelete} />
            </div>
          ))
        )}
      </CardContent>
      {addGoalOpen ? (
        <AddGoalDialog planId={planId} open={addGoalOpen} onOpenChange={setAddGoalOpen} />
      ) : null}
    </Card>
  );
}

interface PlanFormValues {
  participantProfileId: string;
  title: string;
  status: 'active' | 'completed' | 'archived';
  reviewDate: string;
  notes: string;
}

function CreatePlanCard({ participant }: { participant: ParticipantRef }) {
  const queryClient = useQueryClient();
  const [topError, setTopError] = useState('');
  const { register, handleSubmit, setError, formState } = useForm<PlanFormValues>({
    resolver: zodForm<PlanFormValues>(servicePlanSchema),
    defaultValues: {
      participantProfileId: participant.id,
      title: 'Service Plan',
      status: 'active',
      reviewDate: '',
      notes: '',
    },
  });

  const create = useMutation({
    mutationFn: (values: PlanFormValues) => api.post('/service-plans', values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['case-management'] }),
    onError: (err) => {
      // 409 = another active plan exists — surface the API's explanation.
      if (err instanceof ApiError && err.status === 409) setTopError(err.message);
      else setTopError(applyFormErrors(err, setError));
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Start a service plan</CardTitle>
        <CardDescription>{participant.name} has no service plan yet.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-4"
          onSubmit={handleSubmit((values) => {
            setTopError('');
            create.mutate(values);
          })}
        >
          <div className="grid gap-3 md:grid-cols-2">
            <FormField label="Title" error={formState.errors.title}>
              <Input {...register('title')} />
            </FormField>
            <FormField label="Review date" error={formState.errors.reviewDate}>
              <Input type="date" {...register('reviewDate')} />
            </FormField>
          </div>
          <FormField label="Notes" error={formState.errors.notes}>
            <Textarea rows={2} {...register('notes')} />
          </FormField>
          {topError ? <p className="text-sm text-destructive">{topError}</p> : null}
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? 'Creating…' : 'Create plan'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export function ServicePlansPage() {
  const { can } = useAuth();
  const [participant, setParticipant] = useState<ParticipantRef | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);

  const { data: plans, isLoading, error } = useQuery({
    queryKey: ['case-management', 'service-plans', participant?.id],
    queryFn: () =>
      api.get<Paged<ServicePlanRow>>(
        `/service-plans${qs({ participantProfileId: participant?.id, pageSize: 50, sortBy: 'createdAt', sortDir: 'desc' })}`,
      ),
    enabled: !!participant,
  });

  // Default to the active plan, else the most recent.
  const planId =
    selectedPlanId ??
    plans?.items.find((p) => p.status === 'active')?.id ??
    plans?.items[0]?.id ??
    null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Service Plans</h2>
        <div className="w-72">
          <ParticipantPicker
            value={participant}
            onChange={(p) => {
              setParticipant(p);
              setSelectedPlanId(null);
            }}
            placeholder="Select a participant…"
          />
        </div>
      </div>

      {!participant ? (
        <EmptyState
          title="Select a participant"
          hint="Search above to view or start their service plan."
        />
      ) : isLoading ? (
        <PageLoader />
      ) : error ? (
        <ErrorState error={error} />
      ) : !plans || plans.items.length === 0 ? (
        can('case_management.create') ? (
          <CreatePlanCard participant={participant} />
        ) : (
          <EmptyState title="No service plan" hint={`${participant.name} has no service plan.`} />
        )
      ) : (
        <>
          {plans.items.length > 1 ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">Plans:</span>
              {plans.items.map((p) => (
                <Button
                  key={p.id}
                  size="sm"
                  variant={p.id === planId ? 'secondary' : 'ghost'}
                  onClick={() => setSelectedPlanId(p.id)}
                >
                  {p.title} · {humanize(p.status)}
                </Button>
              ))}
            </div>
          ) : null}
          {planId ? <PlanDetail planId={planId} /> : null}
          {/* A new plan can be started once no plan is active (§6.5: one active plan). */}
          {can('case_management.create') && !plans.items.some((p) => p.status === 'active') ? (
            <CreatePlanCard participant={participant} />
          ) : null}
        </>
      )}
    </div>
  );
}
