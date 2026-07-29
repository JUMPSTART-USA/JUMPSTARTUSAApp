import {
  ACTIONS,
  MODULES,
  SPECIAL_PERMISSIONS,
  type SpecialPermission,
} from '@jumpstart/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox, Label } from '@/components/ui/input';
import { Notice } from '@/components/ui/notice';
import { SectionHeader } from '@/components/ui/page-header';
import { EmptyState, ErrorState, PageLoader } from '@/components/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { cn, humanize } from '@/lib/utils';
import type { RoleView } from './types';

const SPECIAL_DESCRIPTIONS: Record<SpecialPermission, string> = {
  'case_notes.confidential.read': "Read other staff's confidential case notes",
  'fields.justice.read': 'View DOC numbers and justice-history fields',
  'fields.pay.read': 'View pay rate and hours on employment records',
  'fields.background_checks.read': 'View background-check adjudication results',
  'person.merge': 'Run the duplicate-merge tool',
  'admin.users': 'Administer user accounts',
  'admin.roles': 'Administer roles and permissions',
  'admin.settings': 'Administer system settings',
  'admin.templates': 'Administer checklist and screening templates',
  'audit.read': 'View the audit log',
  'referral_inbox.read': 'Read the get-help referral inbox',
  'support.access': 'File support tickets and read your own',
};

export function RolesPage() {
  const { can } = useAuth();
  const queryClient = useQueryClient();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  // null draft = mirror the server; a Set means unsaved local edits exist.
  const [draft, setDraft] = useState<Set<string> | null>(null);

  const { data: roles, isLoading, error } = useQuery({
    queryKey: ['admin', 'roles'],
    queryFn: () => api.get<RoleView[]>('/admin/roles'),
    enabled: can('admin.roles'),
  });

  const save = useMutation({
    mutationFn: ({ id, keys }: { id: string; keys: string[] }) =>
      api.put<RoleView>(`/admin/roles/${id}/permissions`, { permissionKeys: keys }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'roles'] });
      setDraft(null);
    },
  });

  if (!can('admin.roles')) {
    return <EmptyState title="No access" hint="Requires the admin.roles permission." />;
  }
  if (isLoading) return <PageLoader />;
  if (error) return <ErrorState error={error} />;
  if (!roles || roles.length === 0) return <EmptyState title="No roles found" />;

  const selected = roles.find((r) => r.id === selectedId) ?? roles[0];
  if (!selected) return <EmptyState title="No roles found" />;
  const locked = selected.key === 'admin';
  const serverKeys = new Set(selected.permissionKeys);
  const keys = draft ?? serverKeys;
  const dirty = draft !== null;

  const selectRole = (id: string) => {
    setSelectedId(id);
    setDraft(null);
    save.reset();
  };

  const toggle = (key: string) => {
    if (locked) return;
    const next = new Set(draft ?? serverKeys);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setDraft(next);
  };

  return (
    <div className="space-y-4">
      <SectionHeader title="Roles" />
      <div className="grid gap-4 lg:grid-cols-[16rem_1fr]">
        <div className="space-y-1">
          {roles.map((role) => (
            <button
              key={role.id}
              type="button"
              onClick={() => selectRole(role.id)}
              className={cn(
                'flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors',
                role.id === selected.id
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-accent hover:text-accent-foreground',
              )}
            >
              <span className="flex items-center gap-1.5 font-medium">
                {role.key === 'admin' ? <Lock className="h-3.5 w-3.5" /> : null}
                {role.name}
              </span>
              <span
                className={cn(
                  'text-xs',
                  role.id === selected.id ? 'text-primary-foreground/80' : 'text-muted-foreground',
                )}
              >
                {role.userCount} user{role.userCount === 1 ? '' : 's'}
              </span>
            </button>
          ))}
        </div>

        <div className="space-y-4">
          <SectionHeader
            title={
              <span className="flex items-center gap-2">
                {selected.name}
                <Badge variant="secondary">{keys.size} permissions</Badge>
              </span>
            }
            description={selected.description ?? undefined}
            actions={
              !locked ? (
                <>
                  {dirty ? (
                    <Button variant="outline" size="sm" onClick={() => setDraft(null)}>
                      Discard changes
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    disabled={!dirty || save.isPending}
                    onClick={() => save.mutate({ id: selected.id, keys: [...keys] })}
                  >
                    {save.isPending ? 'Saving…' : 'Save'}
                  </Button>
                </>
              ) : undefined
            }
          />

          {locked ? (
            <Notice variant="warning">
              The admin role always holds every permission and cannot be edited — this prevents
              administrator lockout.
            </Notice>
          ) : null}
          {save.error ? <ErrorState error={save.error} /> : null}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Module</TableHead>
                {ACTIONS.map((a) => (
                  <TableHead key={a} className="w-24 text-center">
                    {humanize(a)}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {MODULES.map((m) => (
                <TableRow key={m}>
                  <TableCell className="font-medium">{humanize(m)}</TableCell>
                  {ACTIONS.map((a) => {
                    const key = `${m}.${a}`;
                    return (
                      <TableCell key={key} className="text-center">
                        <Checkbox
                          checked={keys.has(key)}
                          disabled={locked}
                          onChange={() => toggle(key)}
                          aria-label={key}
                        />
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <Card>
            <CardHeader>
              <CardTitle>Special permissions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2 sm:grid-cols-2">
                {SPECIAL_PERMISSIONS.map((key) => (
                  <Label key={key} className="flex items-start gap-2 font-normal">
                    <Checkbox
                      className="mt-0.5"
                      checked={keys.has(key)}
                      disabled={locked}
                      onChange={() => toggle(key)}
                    />
                    <span>
                      <span className="font-mono text-xs">{key}</span>
                      <span className="block text-xs text-muted-foreground">
                        {SPECIAL_DESCRIPTIONS[key]}
                      </span>
                    </span>
                  </Label>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
