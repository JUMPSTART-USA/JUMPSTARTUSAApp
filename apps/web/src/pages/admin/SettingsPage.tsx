import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
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
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDate } from '@/lib/utils';
import type { DonorCrmConfig } from '../crm/types';
import { ErrorNotice } from './shared';
import type { AppSetting, EmailConfig } from './types';

/** Seed-known keys (admin/settings.service.ts) — offered even when not yet set. */
const KNOWN_SETTINGS: Record<string, string> = {
  'org.info': 'Organization name/address/contact block used on exports',
  'mentoring.maxActiveMentees': 'Cap on active mentees per mentor, enforced by the mentoring module',
  'states.active': 'States/regions the organization operates in',
  'integrations.donorCrm': 'Active donor CRM for the Development module (see Integrations above)',
  'email.fromAddress': 'Mailbox that invite emails are sent from (see Integrations above)',
};

const KEY_PATTERN = /^[a-z][a-zA-Z0-9_-]*(\.[a-zA-Z0-9_-]+)*$/;

function preview(value: unknown): string {
  const s = JSON.stringify(value);
  if (s === undefined) return '—';
  return s.length > 80 ? `${s.slice(0, 80)}…` : s;
}

interface EditorState {
  key: string;
  isNew: boolean;
  value: unknown;
}

export function SettingsPage() {
  const { can } = useAuth();
  const [editor, setEditor] = useState<EditorState | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'settings'],
    queryFn: () => api.get<AppSetting[]>('/admin/settings'),
    enabled: can('admin.settings'),
  });

  if (!can('admin.settings')) {
    return <EmptyState title="No access" hint="Requires the admin.settings permission." />;
  }
  if (isLoading) return <PageLoader />;
  if (error) return <ErrorState error={error} />;

  const settings = data ?? [];
  const existingKeys = new Set(settings.map((s) => s.key));
  const missingKnown = Object.keys(KNOWN_SETTINGS).filter((k) => !existingKeys.has(k));

  return (
    <div className="space-y-4">
      <IntegrationsCard />

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Settings</h2>
        <Button size="sm" onClick={() => setEditor({ key: '', isNew: true, value: {} })}>
          <Plus className="h-4 w-4" /> New setting
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Free-form JSON per key so configuration shapes can evolve without migrations. Values are
        validated as JSON before saving.
      </p>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Key</TableHead>
            <TableHead>Description</TableHead>
            <TableHead>Value</TableHead>
            <TableHead>Updated</TableHead>
            <TableHead className="w-20" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {settings.length === 0 && missingKnown.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                No settings stored yet
              </TableCell>
            </TableRow>
          ) : null}
          {settings.map((s) => (
            <TableRow key={s.key}>
              <TableCell className="font-mono text-xs">{s.key}</TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {KNOWN_SETTINGS[s.key] ?? '—'}
              </TableCell>
              <TableCell className="max-w-md">
                <code className="block truncate text-xs">{preview(s.value)}</code>
              </TableCell>
              <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                {formatDate(s.updatedAt)}
              </TableCell>
              <TableCell className="text-right">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditor({ key: s.key, isNew: false, value: s.value })}
                >
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </Button>
              </TableCell>
            </TableRow>
          ))}
          {missingKnown.map((key) => (
            <TableRow key={key}>
              <TableCell className="font-mono text-xs">{key}</TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {KNOWN_SETTINGS[key]}
              </TableCell>
              <TableCell>
                <Badge variant="outline">Not set</Badge>
              </TableCell>
              <TableCell className="text-muted-foreground">—</TableCell>
              <TableCell className="text-right">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditor({ key, isNew: false, value: {} })}
                >
                  Set value
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {editor ? (
        <SettingEditorDialog
          key={editor.key || '__new__'}
          editor={editor}
          onClose={() => setEditor(null)}
        />
      ) : null}
    </div>
  );
}

/**
 * Development-module integrations: which donor CRM the donors/donations
 * mirror syncs from. The provider choice is an app setting; API credentials
 * are server environment variables and only their presence is shown here.
 */
function IntegrationsCard() {
  const queryClient = useQueryClient();
  const [saveError, setSaveError] = useState<string | null>(null);

  const { data: config } = useQuery({
    queryKey: ['crm', 'sync', 'config'],
    queryFn: () => api.get<DonorCrmConfig>('/sync/config'),
  });

  const save = useMutation({
    mutationFn: (provider: string) =>
      api.put(`/admin/settings/${encodeURIComponent(config?.settingKey ?? 'integrations.donorCrm')}`, {
        value: { provider },
      }),
    onSuccess: () => {
      setSaveError(null);
      queryClient.invalidateQueries({ queryKey: ['admin', 'settings'] });
      queryClient.invalidateQueries({ queryKey: ['crm', 'sync'] });
    },
    onError: (err) => setSaveError(err instanceof Error ? err.message : 'Save failed'),
  });

  if (!config) return null;

  return (
    <div className="space-y-3 rounded-md border bg-card p-4">
      <div>
        <h2 className="text-lg font-semibold">Integrations</h2>
        <p className="text-sm text-muted-foreground">
          Development module — donor CRM the donors/donations mirror syncs from. API credentials
          are configured as server environment settings, never stored in the database.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-56">
          <div className="mb-1 text-sm font-medium">Donor CRM provider</div>
          <Select
            value={config.provider}
            disabled={save.isPending}
            onChange={(e) => save.mutate(e.target.value)}
          >
            {config.providers.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </Select>
        </div>
        {save.isPending ? <span className="text-sm text-muted-foreground">Saving…</span> : null}
      </div>

      <div className="space-y-1.5">
        {config.providers
          .filter((p) => p.key !== 'none')
          .map((p) => (
            <div key={p.key} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="w-28 font-medium">{p.label}</span>
              <Badge variant={p.envReady ? 'success' : 'outline'}>
                {p.envReady ? 'Credentials configured' : 'Credentials missing'}
              </Badge>
              <code className="text-xs text-muted-foreground">{p.envVars.join(', ')}</code>
            </div>
          ))}
      </div>

      {saveError ? <ErrorNotice>{saveError}</ErrorNotice> : null}

      <EmailSection />
    </div>
  );
}

/**
 * Outbound email (invites): Graph credential status plus the admin-assignable
 * From account. The mailbox must exist in the Microsoft 365 tenant.
 */
function EmailSection() {
  const queryClient = useQueryClient();
  const [fromDraft, setFromDraft] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const { data: email } = useQuery({
    queryKey: ['admin', 'email', 'config'],
    queryFn: () => api.get<EmailConfig>('/admin/email/config'),
  });

  const saveFrom = useMutation({
    mutationFn: (address: string) =>
      api.put(`/admin/settings/${encodeURIComponent(email?.settingKey ?? 'email.fromAddress')}`, {
        value: address,
      }),
    onSuccess: () => {
      setNotice('From address saved.');
      setFromDraft(null);
      queryClient.invalidateQueries({ queryKey: ['admin'] });
    },
    onError: (err) => setNotice(err instanceof Error ? err.message : 'Save failed'),
  });

  const sendTest = useMutation({
    mutationFn: () => api.post<{ sent: boolean; from: string; to: string }>('/admin/email/test'),
    onSuccess: (r) =>
      setNotice(
        r.sent
          ? `Test email sent to ${r.to} from ${r.from} — check the inbox.`
          : 'Test email was NOT sent — check the Graph credentials on the server.',
      ),
    onError: (err) => setNotice(err instanceof Error ? err.message : 'Test failed'),
  });

  if (!email) return null;
  const fromValue = fromDraft ?? email.fromAddress;

  return (
    <div className="mt-4 space-y-3 border-t pt-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="w-28 font-medium">Email (invites)</span>
        <Badge variant={email.configured ? 'success' : 'outline'}>
          {email.configured ? 'Credentials configured' : 'Credentials missing'}
        </Badge>
        <code className="text-xs text-muted-foreground">{email.envVars.join(', ')}</code>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-72">
          <div className="mb-1 text-sm font-medium">Send invites from</div>
          <Input
            type="email"
            value={fromValue}
            onChange={(e) => setFromDraft(e.target.value)}
            placeholder="no-reply@jumpstartusa.org"
          />
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={saveFrom.isPending || fromDraft === null || fromDraft === email.fromAddress}
          onClick={() => saveFrom.mutate(fromValue)}
        >
          {saveFrom.isPending ? 'Saving…' : 'Save'}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={sendTest.isPending || !email.configured}
          onClick={() => sendTest.mutate()}
        >
          {sendTest.isPending ? 'Sending…' : 'Send test email'}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Invites are sent through Microsoft 365 — the From account must be a real mailbox (or
        shared mailbox) in the organization.
      </p>
      {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}
    </div>
  );
}

function SettingEditorDialog({ editor, onClose }: { editor: EditorState; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [key, setKey] = useState(editor.key);
  const [text, setText] = useState(() => JSON.stringify(editor.value ?? {}, null, 2));
  const [problem, setProblem] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: ({ k, value }: { k: string; value: unknown }) =>
      api.put<AppSetting>(`/admin/settings/${encodeURIComponent(k)}`, { value }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'settings'] });
      onClose();
    },
    onError: (err) => setProblem(err instanceof Error ? err.message : 'Save failed'),
  });

  const submit = () => {
    setProblem(null);
    const trimmedKey = key.trim();
    if (!KEY_PATTERN.test(trimmedKey)) {
      setProblem("Invalid key — use dotted lowercase identifiers like 'org.info'");
      return;
    }
    // Parse-validate before PUT: never send unparseable or null JSON.
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch (e) {
      setProblem(`Invalid JSON: ${e instanceof Error ? e.message : 'parse error'}`);
      return;
    }
    if (value === null) {
      setProblem('null is not allowed — use an empty object {} to clear a setting');
      return;
    }
    save.mutate({ k: trimmedKey, value });
  };

  return (
    <Dialog open onOpenChange={(next) => (!next ? onClose() : undefined)}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{editor.isNew ? 'New setting' : `Edit ${editor.key}`}</DialogTitle>
          <DialogDescription>
            {KNOWN_SETTINGS[editor.key] ?? 'The value is stored as JSON exactly as entered.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {editor.isNew ? (
            <FormField label="Key" required hint="Dotted lowercase, e.g. org.info">
              <Input value={key} onChange={(e) => setKey(e.target.value)} placeholder="org.info" />
            </FormField>
          ) : null}
          <FormField label="Value (JSON)" required>
            <Textarea
              rows={10}
              className="font-mono text-xs"
              value={text}
              onChange={(e) => setText(e.target.value)}
              spellCheck={false}
            />
          </FormField>
          {problem ? <ErrorNotice>{problem}</ErrorNotice> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Save setting'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
