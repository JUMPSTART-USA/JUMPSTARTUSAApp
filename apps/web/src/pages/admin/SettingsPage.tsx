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
import { Input, Textarea } from '@/components/ui/input';
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
import { ErrorNotice } from './shared';
import type { AppSetting } from './types';

/** Seed-known keys (admin/settings.service.ts) — offered even when not yet set. */
const KNOWN_SETTINGS: Record<string, string> = {
  'org.info': 'Organization name/address/contact block used on exports',
  'mentoring.maxActiveMentees': 'Cap on active mentees per mentor, enforced by the mentoring module',
  'states.active': 'States/regions the organization operates in',
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
