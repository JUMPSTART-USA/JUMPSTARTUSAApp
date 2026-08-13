import { zodResolver } from '@hookform/resolvers/zod';
import {
  CHAPTER_NAMES,
  CHAPTER_STATES,
  createUserSchema,
  ROLE_KEYS,
  ROLE_NAMES,
  updateUserSchema,
  USER_STATUSES,
  type RoleKey,
} from '@jumpstart/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm, type Resolver, type UseFormRegister } from 'react-hook-form';
import { DataTable, type Column } from '@/components/DataTable';
import { FormField } from '@/components/FormField';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FilterSelect } from '@/components/ui/filter-select';
import { Checkbox, Input, Label, Select } from '@/components/ui/input';
import { FormError, Notice } from '@/components/ui/notice';
import { SectionHeader } from '@/components/ui/page-header';
import { EmptyState, ErrorState } from '@/components/ui/spinner';
import { ListToolbar, SearchInput } from '@/components/ui/toolbar';
import { api, qs, type Paged } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { P, useListParams } from '@/lib/list-params';
import { applyApiError } from '@/lib/form';
import { formatDate, humanize } from '@/lib/utils';
import { useActiveUserOptions } from './shared';
import type { AdminUser, DeactivateResult, InviteResult } from './types';

export function UsersPage() {
  const { can, user: me } = useAuth();
  const queryClient = useQueryClient();

  const { values, draft, set, listState, onListStateChange } = useListParams({
    search: P.text(),
    status: P.choice(USER_STATUSES, ''),
  });
  const [inviteOpen, setInviteOpen] = useState(false);
  const [resendResult, setResendResult] = useState<InviteResult | null>(null);
  const [editUser, setEditUser] = useState<AdminUser | null>(null);
  const [deactivateUser, setDeactivateUser] = useState<AdminUser | null>(null);

  const canWrite = can('admin.users');

  const params = {
    page: listState.page,
    pageSize: listState.pageSize,
    sortBy: listState.sortBy,
    sortDir: listState.sortDir,
    // `values`, not `draft`: the query waits for typing to settle.
    search: values.search,
    status: values.status,
  };

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['admin', 'users', 'list', params],
    queryFn: () => api.get<Paged<AdminUser>>(`/admin/users${qs(params)}`),
    enabled: canWrite,
    // Rows stay put through a page or filter change; DataTable dims them.
    placeholderData: keepPreviousData,
  });

  const reactivate = useMutation({
    mutationFn: (id: string) => api.post<AdminUser>(`/admin/users/${id}/reactivate`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'users'] }),
  });

  const resendInvite = useMutation({
    mutationFn: (id: string) => api.post<InviteResult>(`/admin/users/${id}/resend-invite`),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      setResendResult(result);
    },
  });

  // One chapter or all (§7.2): empty list = every chapter (admin/executive).
  const setChapter = useMutation({
    mutationFn: ({ id, chapter }: { id: string; chapter: string }) =>
      api.put(`/admin/users/${id}/region-scopes`, { states: chapter ? [chapter] : [] }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'users'] }),
  });

  if (!canWrite) {
    return <EmptyState title="No access" hint="Requires the admin.users permission." />;
  }

  const columns: Column<AdminUser>[] = [
    {
      key: 'name',
      header: 'Name',
      sortKey: 'lastName',
      render: (row) => (
        <div>
          <span className="font-medium">
            {row.firstName} {row.lastName}
          </span>
          {row.id === me?.id ? (
            <Badge variant="outline" className="ml-2">
              You
            </Badge>
          ) : null}
        </div>
      ),
    },
    {
      key: 'email',
      header: 'Email',
      sortKey: 'email',
      render: (row) => <span className="text-muted-foreground">{row.email}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      sortKey: 'status',
      render: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: 'roles',
      header: 'Roles',
      render: (row) => (
        <div className="flex flex-wrap gap-1">
          {row.roles.length === 0 ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            row.roles.map((r) => (
              <Badge key={r} variant="secondary">
                {ROLE_NAMES[r] ?? humanize(r)}
              </Badge>
            ))
          )}
        </div>
      ),
    },
    {
      key: 'chapter',
      header: 'Chapter',
      // Chapter scoping (§7.2): admins are always all-chapters — the API rejects
      // scope rows for them, so show static text instead of the select.
      render: (row) =>
        row.roles.includes('admin') ? (
          <span
            className="text-muted-foreground"
            title="Administrators always see all chapters"
          >
            All chapters
          </span>
        ) : (
          <div onClick={(e) => e.stopPropagation()}>
            <FilterSelect
              aria-label="Chapter"
              className="w-40"
              value={row.chapter ?? ''}
              disabled={setChapter.isPending}
              onChange={(value) => setChapter.mutate({ id: row.id, chapter: value })}
            >
              <option value="">All chapters</option>
              {CHAPTER_STATES.map((s) => (
                <option key={s} value={s}>
                  {CHAPTER_NAMES[s]}
                </option>
              ))}
            </FilterSelect>
          </div>
        ),
    },
    {
      key: 'lastLoginAt',
      header: 'Last login',
      sortKey: 'lastLoginAt',
      render: (row) =>
        row.lastLoginAt ? (
          formatDate(row.lastLoginAt)
        ) : (
          <span className="text-muted-foreground">Never</span>
        ),
    },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (row) => (
        <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <Button variant="outline" size="sm" onClick={() => setEditUser(row)}>
            Edit
          </Button>
          {row.status === 'invited' ? (
            <Button
              variant="outline"
              size="sm"
              disabled={resendInvite.isPending}
              onClick={() => resendInvite.mutate(row.id)}
            >
              Resend invite
            </Button>
          ) : null}
          {row.status === 'deactivated' ? (
            <Button
              variant="outline"
              size="sm"
              disabled={reactivate.isPending}
              onClick={() => reactivate.mutate(row.id)}
            >
              Reactivate
            </Button>
          ) : row.id !== me?.id ? (
            <Button variant="destructive" size="sm" onClick={() => setDeactivateUser(row)}>
              Deactivate
            </Button>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Users"
        actions={
          <Button onClick={() => setInviteOpen(true)}>
            <Plus className="h-4 w-4" /> Invite user
          </Button>
        }
      />

      <ListToolbar>
        {/* `draft` so the box echoes every keystroke; the query reads `values`,
            which lands once typing settles. */}
        <SearchInput
          placeholder="Search name or email…"
          value={draft.search}
          onChange={(e) => set('search', e.target.value)}
        />
        <FilterSelect
          aria-label="Status"
          className="w-full sm:w-44"
          value={values.status}
          onChange={(value) => set('status', value as (typeof USER_STATUSES)[number] | '')}
        >
          <option value="">All statuses</option>
          {USER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {humanize(s)}
            </option>
          ))}
        </FilterSelect>
      </ListToolbar>

      {error ? <ErrorState error={error} onRetry={refetch} /> : null}
      {reactivate.error ? <ErrorState error={reactivate.error} /> : null}
      {resendInvite.error ? <ErrorState error={resendInvite.error} /> : null}
      {setChapter.error ? <ErrorState error={setChapter.error} /> : null}

      {resendResult ? (
        <Dialog open onOpenChange={(next) => (!next ? setResendResult(null) : undefined)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Invite re-sent</DialogTitle>
              <DialogDescription>
                A new temporary password was generated for {resendResult.user.email} — the old
                one no longer works.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              {resendResult.emailSent ? (
                <Notice variant="success">
                  Invite email sent to {resendResult.user.email} from {resendResult.emailFrom}.
                </Notice>
              ) : (
                <Notice variant="warning">
                  No invite email was sent — outbound email is not configured. Hand the
                  temporary password off out-of-band.
                </Notice>
              )}
              <code className="block rounded-md border bg-muted px-3 py-2 font-mono text-sm">
                {resendResult.temporaryPassword}
              </code>
              <DialogFooter>
                <Button onClick={() => setResendResult(null)}>Done</Button>
              </DialogFooter>
            </div>
          </DialogContent>
        </Dialog>
      ) : null}

      <DataTable
        columns={columns}
        data={data}
        isLoading={isLoading}
        isFetching={isFetching}
        state={listState}
        onStateChange={onListStateChange}
        emptyMessage="No users found"
      />

      <InviteUserDialog open={inviteOpen} onOpenChange={setInviteOpen} />
      <EditUserDialog user={editUser} onClose={() => setEditUser(null)} />
      <DeactivateUserDialog user={deactivateUser} onClose={() => setDeactivateUser(null)} />
    </div>
  );
}

// ── Invite ───────────────────────────────────────────────────────────────────

interface InviteFormValues {
  email: string;
  firstName: string;
  lastName: string;
  roles: RoleKey[];
  /** Chapter scope: a state code, or null for all chapters. */
  chapter: string | null;
}

const inviteResolver = zodResolver(createUserSchema) as unknown as Resolver<InviteFormValues>;

function RoleCheckboxes({ register }: { register: UseFormRegister<InviteFormValues> }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
      {ROLE_KEYS.map((key) => (
        <Label key={key} className="flex items-center gap-2 font-normal">
          <Checkbox value={key} {...register('roles')} />
          {ROLE_NAMES[key]}
        </Label>
      ))}
    </div>
  );
}

function InviteUserDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [topError, setTopError] = useState<string | null>(null);
  const [invited, setInvited] = useState<InviteResult | null>(null);
  const [copied, setCopied] = useState(false);

  const form = useForm<InviteFormValues>({
    resolver: inviteResolver,
    defaultValues: { email: '', firstName: '', lastName: '', roles: [], chapter: null },
  });

  const close = (next: boolean) => {
    if (!next) {
      form.reset();
      setTopError(null);
      setInvited(null);
      setCopied(false);
    }
    onOpenChange(next);
  };

  const create = useMutation({
    mutationFn: (payload: InviteFormValues) => api.post<InviteResult>('/admin/users', payload),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      // Keep the dialog open — the temporary password is shown exactly once.
      setInvited(result);
    },
    onError: (err) => setTopError(applyApiError(err, form.setError)),
  });

  const copyPassword = async () => {
    if (!invited) return;
    await navigator.clipboard.writeText(invited.temporaryPassword);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const { register, formState, watch, setValue } = form;
  const isAdmin = (watch('roles') ?? []).includes('admin');
  const chapter = watch('chapter');

  // Chapter scoping (§7.2): administrators are always all-chapters.
  useEffect(() => {
    if (isAdmin) setValue('chapter', null);
  }, [isAdmin, setValue]);

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{invited ? 'User invited' : 'Invite user'}</DialogTitle>
          <DialogDescription>
            {invited
              ? `${invited.user.firstName} ${invited.user.lastName} (${invited.user.email}) can now sign in.`
              : 'Creates an invited account with a one-time temporary password to hand off out-of-band.'}
          </DialogDescription>
        </DialogHeader>

        {invited ? (
          <div className="space-y-3">
            {invited.emailSent ? (
              <Notice variant="success">
                Invite email sent to {invited.user.email} from {invited.emailFrom}.
              </Notice>
            ) : (
              <Notice variant="warning">
                No invite email was sent — outbound email is not configured (see Admin →
                Settings → Integrations). Hand the temporary password off out-of-band.
              </Notice>
            )}
            <Notice variant="warning">
              Store this temporary password now — it is shown only this once and is never stored
              or displayed again. The user must change it at first login.
            </Notice>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded-md border bg-muted px-3 py-2 font-mono text-sm">
                {invited.temporaryPassword}
              </code>
              <Button variant="outline" size="sm" onClick={copyPassword}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
            <DialogFooter>
              <Button onClick={() => close(false)}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <form
            onSubmit={form.handleSubmit((values) => {
              setTopError(null);
              // Chapter scoping (§7.2): admins are always all-chapters.
              create.mutate({
                ...values,
                chapter: values.roles.includes('admin') ? null : values.chapter,
              });
            })}
            className="space-y-4"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FormField label="First name" required error={formState.errors.firstName}>
                <Input {...register('firstName')} />
              </FormField>
              <FormField label="Last name" required error={formState.errors.lastName}>
                <Input {...register('lastName')} />
              </FormField>
              <FormField
                label="Email"
                required
                error={formState.errors.email}
                className="col-span-2"
              >
                <Input type="email" {...register('email')} />
              </FormField>
            </div>
            <FormField
              label="Roles"
              required
              error={formState.errors.roles as { message?: string } | undefined}
              hint="Roles are additive — the user gets the union of all selected roles."
            >
              <RoleCheckboxes register={register} />
            </FormField>
            <FormField
              label="Chapter"
              error={formState.errors.chapter}
              hint={
                isAdmin
                  ? 'Administrators always see all chapters.'
                  : 'Scopes the user to one chapter; leave on All chapters for org-wide access.'
              }
            >
              <Select
                value={isAdmin ? '' : (chapter ?? '')}
                disabled={isAdmin}
                onChange={(e) => setValue('chapter', e.target.value || null)}
              >
                <option value="">All chapters</option>
                {CHAPTER_STATES.map((s) => (
                  <option key={s} value={s}>
                    {CHAPTER_NAMES[s]}
                  </option>
                ))}
              </Select>
            </FormField>

            <FormError message={topError} />

            <DialogFooter>
              <Button variant="outline" onClick={() => close(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={create.isPending}>
                {create.isPending ? 'Sending…' : 'Invite user'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Edit ─────────────────────────────────────────────────────────────────────

const editResolver = zodResolver(updateUserSchema) as unknown as Resolver<InviteFormValues>;

function EditUserDialog({ user, onClose }: { user: AdminUser | null; onClose: () => void }) {
  // Keyed remount gives each edit session fresh defaults.
  if (!user) return null;
  return <EditUserDialogInner key={user.id} user={user} onClose={onClose} />;
}

function EditUserDialogInner({ user, onClose }: { user: AdminUser; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [topError, setTopError] = useState<string | null>(null);

  const form = useForm<InviteFormValues>({
    resolver: editResolver,
    defaultValues: {
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      roles: user.roles,
    },
  });

  const update = useMutation({
    mutationFn: (payload: InviteFormValues) =>
      api.patch<AdminUser>(`/admin/users/${user.id}`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      onClose();
    },
    onError: (err) => setTopError(applyApiError(err, form.setError)),
  });

  const { register, formState } = form;

  return (
    <Dialog open onOpenChange={(next) => (!next ? onClose() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit user</DialogTitle>
          <DialogDescription>
            Role changes take effect on the user's next request and are audited.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={form.handleSubmit((values) => {
            setTopError(null);
            update.mutate(values);
          })}
          className="space-y-4"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="First name" required error={formState.errors.firstName}>
              <Input {...register('firstName')} />
            </FormField>
            <FormField label="Last name" required error={formState.errors.lastName}>
              <Input {...register('lastName')} />
            </FormField>
            <FormField label="Email" required error={formState.errors.email} className="col-span-2">
              <Input type="email" {...register('email')} />
            </FormField>
          </div>
          <FormField
            label="Roles"
            required
            error={formState.errors.roles as { message?: string } | undefined}
          >
            <RoleCheckboxes register={register} />
          </FormField>

          <FormError message={topError} />

          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={update.isPending}>
              {update.isPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Deactivate (§7.6 departing-staff flow) ───────────────────────────────────

function DeactivateUserDialog({
  user,
  onClose,
}: {
  user: AdminUser | null;
  onClose: () => void;
}) {
  if (!user) return null;
  return <DeactivateUserDialogInner key={user.id} user={user} onClose={onClose} />;
}

function DeactivateUserDialogInner({ user, onClose }: { user: AdminUser; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [reassignToUserId, setReassignToUserId] = useState('');
  const [result, setResult] = useState<DeactivateResult | null>(null);
  const { users: activeUsers, isLoading } = useActiveUserOptions(true);
  const targets = activeUsers.filter((u) => u.id !== user.id);

  const deactivate = useMutation({
    mutationFn: () =>
      api.post<DeactivateResult>(`/admin/users/${user.id}/deactivate`, { reassignToUserId }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      setResult(res);
    },
  });

  return (
    <Dialog open onOpenChange={(next) => (!next ? onClose() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Deactivate {user.firstName} {user.lastName}
          </DialogTitle>
          <DialogDescription>
            Departing-staff flow (§7.6): one transaction deactivates the account, kills every
            live session immediately, and hands their open caseload to another staff member.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-3">
            <Notice variant="warning">
              Account deactivated. {result.sessionsRevoked} session
              {result.sessionsRevoked === 1 ? '' : 's'} revoked, {result.participantsReassigned}{' '}
              participant{result.participantsReassigned === 1 ? '' : 's'} and{' '}
              {result.tasksReassigned} open task{result.tasksReassigned === 1 ? '' : 's'}{' '}
              reassigned.
            </Notice>
            <DialogFooter>
              <Button onClick={onClose}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <FormField
              label="Reassign caseload to"
              required
              hint="Assigned participants and open/in-progress tasks move to this active user."
            >
              <Select
                value={reassignToUserId}
                onChange={(e) => setReassignToUserId(e.target.value)}
              >
                <option value="">{isLoading ? 'Loading…' : 'Select an active user…'}</option>
                {targets.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.firstName} {u.lastName} ({u.email})
                  </option>
                ))}
              </Select>
            </FormField>

            {deactivate.error ? <ErrorState error={deactivate.error} /> : null}

            <DialogFooter>
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={!reassignToUserId || deactivate.isPending}
                onClick={() => deactivate.mutate()}
              >
                {deactivate.isPending ? 'Deactivating…' : 'Deactivate account'}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
