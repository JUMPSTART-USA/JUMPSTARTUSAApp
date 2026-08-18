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
import { EmptyState, ErrorState, NoAccess } from '@/components/ui/spinner';
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

  const { values, draft, set, listState, onListStateChange, clear, isFiltered } = useListParams({
    search: P.text(),
    status: P.choice(USER_STATUSES, ''),
  });
  const [inviteOpen, setInviteOpen] = useState(false);
  const [resendResult, setResendResult] = useState<InviteResult | null>(null);
  const [editUser, setEditUser] = useState<AdminUser | null>(null);
  const [deactivateUser, setDeactivateUser] = useState<AdminUser | null>(null);
  const [resetPasswordUser, setResetPasswordUser] = useState<AdminUser | null>(null);
  const [removePasskeysUser, setRemovePasskeysUser] = useState<AdminUser | null>(null);
  const [issuedLink, setIssuedLink] = useState<string | null>(null);
  const [resetTotpUser, setResetTotpUser] = useState<AdminUser | null>(null);

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

  // Lost-authenticator rescue: clears the user's TOTP + recovery codes so
  // they sign in with their password and re-enroll at /account.
  const resetTotp = useMutation({
    mutationFn: ({ id, code }: { id: string; code?: string }) =>
      api.post<AdminUser>(`/admin/users/${id}/reset-totp`, code ? { code } : {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      setResetTotpUser(null);
    },
  });

  /**
   * Issue a password-reset LINK. The admin never sees or sets a password —
   * same contract as invitations. Step-up proofed, so it shares the 2FA
   * confirm dialog.
   */
  const resetPassword = useMutation({
    mutationFn: ({ id, code }: { id: string; code?: string }) =>
      api.post<{ resetUrl: string; emailSent: boolean }>(
        `/admin/users/${id}/reset-password`,
        code ? { code } : {},
      ),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      setResetPasswordUser(null);
      // Shown once, like an invitation link — mail may be unconfigured.
      setIssuedLink(res.resetUrl);
    },
  });

  /** Lost phone, authenticator app intact: passkeys only, TOTP untouched. */
  const removePasskeys = useMutation({
    mutationFn: ({ id, code }: { id: string; code?: string }) =>
      api.post<AdminUser>(`/admin/users/${id}/remove-passkeys`, code ? { code } : {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      setRemovePasskeysUser(null);
    },
  });

  /** Close the door, change nothing else. Reversible, so no confirm dialog. */
  const suspendSignIn = useMutation({
    mutationFn: (id: string) => api.post<AdminUser>(`/admin/users/${id}/suspend-sign-in`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'users'] }),
  });

  const restoreSignIn = useMutation({
    mutationFn: (id: string) => api.post<AdminUser>(`/admin/users/${id}/restore-sign-in`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'users'] }),
  });

  // One chapter or all (§7.2): empty list = every chapter (admin/executive).
  const setChapter = useMutation({
    mutationFn: ({ id, chapter }: { id: string; chapter: string }) =>
      api.put(`/admin/users/${id}/region-scopes`, { states: chapter ? [chapter] : [] }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'users'] }),
  });

  if (!canWrite) {
    return <NoAccess reason="Requires the admin.users permission." />;
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
      /**
       * Suspension sits BESIDE the status rather than replacing it — the two
       * are orthogonal, and collapsing them would hide that a suspended
       * account is still, say, invited. Without this the row offers "Restore
       * sign-in" with nothing on screen explaining why.
       */
      render: (row) => (
        <div className="flex flex-wrap items-center gap-1">
          <StatusBadge status={row.status} />
          {row.signInSuspendedAt ? (
            <Badge variant="warning" title={`Suspended ${formatDate(row.signInSuspendedAt)}`}>
              Sign-in suspended
            </Badge>
          ) : null}
        </div>
      ),
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
          {row.totpEnabled || row.passkeyCount > 0 ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                resetTotp.reset();
                setResetTotpUser(row);
              }}
            >
              Reset 2FA
            </Button>
          ) : null}
          {row.status !== 'deactivated' ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                resetPassword.reset();
                setResetPasswordUser(row);
              }}
            >
              Reset password
            </Button>
          ) : null}
          {row.passkeyCount > 0 ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                removePasskeys.reset();
                setRemovePasskeysUser(row);
              }}
            >
              Remove passkeys
            </Button>
          ) : null}
          {/* Suspension is reversible and touches nothing else, so it needs no
              confirm step — unlike Deactivate, which reassigns a caseload. */}
          {row.status !== 'deactivated' && row.id !== me?.id ? (
            row.signInSuspendedAt ? (
              <Button
                variant="outline"
                size="sm"
                disabled={restoreSignIn.isPending}
                onClick={() => restoreSignIn.mutate(row.id)}
              >
                Restore sign-in
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                disabled={suspendSignIn.isPending}
                onClick={() => suspendSignIn.mutate(row.id)}
              >
                Suspend sign-in
              </Button>
            )
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
                  No invite email was sent — outbound email is not configured. Hand this link
                  over out-of-band.
                </Notice>
              )}
              <code className="block break-all rounded-md border bg-muted px-3 py-2 font-mono text-sm">
                {resendResult.inviteUrl}
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
        isFiltered={isFiltered}
        onClearFilters={clear}
        emptyMessage="No users found"
      />

      <InviteUserDialog open={inviteOpen} onOpenChange={setInviteOpen} />
      <EditUserDialog user={editUser} onClose={() => setEditUser(null)} />
      <DeactivateUserDialog user={deactivateUser} onClose={() => setDeactivateUser(null)} />
      <StepUpConfirmDialog
        user={resetTotpUser}
        title="Reset two-factor"
        description="Clears their authenticator, passkeys, and every recovery code. They sign in with just their password until they re-enroll under My account."
        confirmLabel="Reset 2FA"
        hint="From your own authenticator — authorizes the reset."
        needsCode={me?.totpEnabled ?? false}
        isPending={resetTotp.isPending}
        error={resetTotp.error ? resetTotp.error.message : null}
        onConfirm={(code) =>
          resetTotpUser ? resetTotp.mutate({ id: resetTotpUser.id, code }) : undefined
        }
        onClose={() => setResetTotpUser(null)}
      />
      <StepUpConfirmDialog
        user={resetPasswordUser}
        title="Send a password reset"
        description="Emails them a single-use link to choose a new password, and signs them out everywhere. Their current password keeps working until they use the link."
        confirmLabel="Send reset link"
        hint="From your own authenticator — authorizes the reset."
        needsCode={me?.totpEnabled ?? false}
        isPending={resetPassword.isPending}
        error={resetPassword.error ? resetPassword.error.message : null}
        onConfirm={(code) =>
          resetPasswordUser ? resetPassword.mutate({ id: resetPasswordUser.id, code }) : undefined
        }
        onClose={() => setResetPasswordUser(null)}
      />
      <StepUpConfirmDialog
        user={removePasskeysUser}
        title="Remove passkeys"
        description="Deletes every passkey on the account and signs them out everywhere. Their authenticator app and recovery codes are left alone — use Reset 2FA to clear those too."
        confirmLabel="Remove passkeys"
        hint="From your own authenticator — authorizes the removal."
        needsCode={me?.totpEnabled ?? false}
        isPending={removePasskeys.isPending}
        error={removePasskeys.error ? removePasskeys.error.message : null}
        onConfirm={(code) =>
          removePasskeysUser
            ? removePasskeys.mutate({ id: removePasskeysUser.id, code })
            : undefined
        }
        onClose={() => setRemovePasskeysUser(null)}
      />
      {/* The link is shown ONCE, for the case where mail is unconfigured or
          the user cannot reach their inbox. */}
      <Dialog open={issuedLink !== null} onOpenChange={(next) => (!next ? setIssuedLink(null) : undefined)}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Password reset link</DialogTitle>
            <DialogDescription>
              Emailed to them already. Copy it only if you need to hand it over another way — it
              works once, and this is the only time it is shown.
            </DialogDescription>
          </DialogHeader>
          <p className="break-all rounded-md border bg-muted/40 p-2 font-mono text-xs">
            {issuedLink}
          </p>
          <DialogFooter>
            <Button onClick={() => setIssuedLink(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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

  const copyInviteUrl = async () => {
    if (!invited) return;
    await navigator.clipboard.writeText(invited.inviteUrl);
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
              ? `${invited.user.firstName} ${invited.user.lastName} (${invited.user.email}) can now set their password.`
              : 'Creates an account and issues a single-use invitation link. The account cannot be signed into until the link is used.'}
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
                Settings → Integrations). Hand this link over out-of-band.
              </Notice>
            )}
            <Notice variant="warning">
              Copy this link now — it is shown only once and only its hash is stored, so it
              cannot be looked up again. It works once and expires in seven days; re-inviting
              issues a new one and kills this.
            </Notice>
            <div className="flex items-center gap-2">
              <code className="flex-1 break-all rounded-md border bg-muted px-3 py-2 font-mono text-sm">
                {invited.inviteUrl}
              </code>
              <Button variant="outline" size="sm" onClick={copyInviteUrl}>
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
  const [stepUpCode, setStepUpCode] = useState('');
  const { user: me } = useAuth();

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
      api.patch<AdminUser>(`/admin/users/${user.id}`, {
        ...payload,
        ...(stepUpCode ? { code: stepUpCode } : {}),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      onClose();
    },
    onError: (err) => setTopError(applyApiError(err, form.setError)),
  });

  const { register, formState } = form;

  /**
   * Changing an email or a role is a takeover-shaped action, so the API asks
   * the acting admin to prove possession of their own second factor. Watch the
   * form so the prompt appears as soon as the edit becomes one of those,
   * rather than after a failed save — the code has a 30-second life and going
   * to fetch one only once the request has already been refused wastes it.
   */
  const watched = form.watch();
  const isSensitiveEdit =
    watched.email !== user.email || !sameRoleSet(watched.roles ?? [], user.roles);
  const needsCode = isSensitiveEdit && (me?.totpEnabled ?? false);

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

          {needsCode ? (
            <FormField
              label="Your authenticator code"
              required
              hint="Changing an email address or a role needs your own 6-digit code."
            >
              <Input
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={stepUpCode}
                onChange={(e) => setStepUpCode(e.target.value.replace(/\D/g, ''))}
              />
            </FormField>
          ) : null}

          <FormError message={topError} />

          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={update.isPending || (needsCode && stepUpCode.length !== 6)}
            >
              {update.isPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Order-insensitive role comparison, so re-checking the same boxes is not an edit. */
function sameRoleSet(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((role) => b.includes(role));
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

/**
 * Reset-2FA confirm with step-up (§3.2): once the ACTING admin is enrolled,
 * removing someone's second factor demands the admin's own current code — a
 * signed-in-but-unattended screen must not be enough. ConfirmDialog can't
 * host an input (description renders inside a <p>), hence the bespoke dialog.
 */
/**
 * Confirm an action that changes how someone else's account is secured.
 *
 * One dialog for all three (reset 2FA, reset password, remove passkeys)
 * because the mechanics are identical — the acting admin proves possession
 * with their own code — and only the wording differs. Three copies would have
 * drifted the moment one of them learned something the others did not.
 */
function StepUpConfirmDialog({
  user,
  title,
  description,
  confirmLabel,
  hint,
  needsCode,
  isPending,
  error,
  onConfirm,
  onClose,
}: {
  user: AdminUser | null;
  title: string;
  description: string;
  confirmLabel: string;
  hint: string;
  needsCode: boolean;
  isPending: boolean;
  error: string | null;
  onConfirm: (code?: string) => void;
  onClose: () => void;
}) {
  const [code, setCode] = useState('');
  // Render-time reset so one user's typed code never carries to the next.
  const [lastUserId, setLastUserId] = useState(user?.id ?? null);
  if ((user?.id ?? null) !== lastUserId) {
    setLastUserId(user?.id ?? null);
    setCode('');
  }
  return (
    <Dialog open={user !== null} onOpenChange={(next) => (!next && !isPending ? onClose() : undefined)}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>
            {title} for {user?.firstName} {user?.lastName}?
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {needsCode ? (
          <FormField label="Your 6-digit code" hint={hint}>
            <Input
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              className="w-32 text-center font-mono"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            />
          </FormField>
        ) : null}
        <FormError message={error} />
        <DialogFooter>
          <Button variant="outline" disabled={isPending} onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={isPending || (needsCode && code.length !== 6)}
            onClick={() => onConfirm(needsCode ? code : undefined)}
          >
            {isPending ? 'Working…' : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
