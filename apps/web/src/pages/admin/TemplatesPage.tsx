import { zodResolver } from '@hookform/resolvers/zod';
import { checklistTemplateSchema, mentorScreeningTemplateSchema } from '@jumpstart/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useFieldArray, useForm, type Resolver } from 'react-hook-form';
import type { ZodTypeAny } from 'zod';
import { FormField } from '@/components/FormField';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Checkbox, Input, Label } from '@/components/ui/input';
import { FormError, Notice } from '@/components/ui/notice';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { applyApiError } from '@/lib/form';
import type { TemplateRecord } from './types';

interface TemplateKind {
  /** e.g. '/admin/templates/onboarding-checklists' */
  basePath: string;
  queryKey: string[];
  noun: string;
  itemNoun: string;
  countLabel: string;
  countField: 'checklists' | 'screenings';
  schema: ZodTypeAny;
}

const CHECKLIST_KIND: TemplateKind = {
  basePath: '/admin/templates/onboarding-checklists',
  queryKey: ['admin', 'templates', 'checklists'],
  noun: 'checklist template',
  itemNoun: 'item',
  countLabel: 'Checklists created',
  countField: 'checklists',
  schema: checklistTemplateSchema,
};

const SCREENING_KIND: TemplateKind = {
  basePath: '/admin/templates/mentor-screenings',
  queryKey: ['admin', 'templates', 'screenings'],
  noun: 'screening template',
  itemNoun: 'criterion',
  countLabel: 'Screenings created',
  countField: 'screenings',
  schema: mentorScreeningTemplateSchema,
};

export function TemplatesPage() {
  const { can } = useAuth();

  if (!can('admin.templates')) {
    return <EmptyState title="No access" hint="Requires the admin.templates permission." />;
  }

  return (
    <div className="space-y-4">
      <SectionHeader title="Templates" />
      <Notice variant="warning">
        Instantiated checklists and screenings hold snapshots of template items — editing a
        template here never changes existing or in-flight records; only newly created ones pick
        up the changes.
      </Notice>
      <Tabs defaultValue="checklists">
        <TabsList>
          <TabsTrigger value="checklists">Onboarding checklists</TabsTrigger>
          <TabsTrigger value="screenings">Mentor screenings</TabsTrigger>
        </TabsList>
        <TabsContent value="checklists">
          <TemplateSection kind={CHECKLIST_KIND} />
        </TabsContent>
        <TabsContent value="screenings">
          <TemplateSection kind={SCREENING_KIND} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function TemplateSection({ kind }: { kind: TemplateKind }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<TemplateRecord | 'new' | null>(null);
  const [confirming, setConfirming] = useState<TemplateRecord | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: kind.queryKey,
    queryFn: () => api.get<TemplateRecord[]>(kind.basePath),
  });

  const deactivate = useMutation({
    mutationFn: (id: string) => api.delete<{ ok: boolean }>(`${kind.basePath}/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: kind.queryKey });
      setConfirming(null);
    },
  });

  if (isLoading) return <PageLoader />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;

  const templates = data ?? [];

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button onClick={() => setEditing('new')}>
          <Plus className="h-4 w-4" /> New {kind.noun}
        </Button>
      </div>

      {templates.length === 0 ? (
        <EmptyState title={`No ${kind.noun}s yet`} hint="Create one to get started." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Items</TableHead>
              <TableHead>{kind.countLabel}</TableHead>
              <TableHead className="w-40" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {templates.map((t) => (
              <TableRow key={t.id}>
                <TableCell>
                  <span className="font-medium">{t.name}</span>
                  {t.isDefault ? (
                    <Badge variant="info" className="ml-2">
                      Default
                    </Badge>
                  ) : null}
                </TableCell>
                <TableCell>
                  {t.active ? (
                    <Badge variant="success">Active</Badge>
                  ) : (
                    <Badge variant="outline">Inactive</Badge>
                  )}
                </TableCell>
                <TableCell>{t.items.length}</TableCell>
                <TableCell>{t._count[kind.countField] ?? 0}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="outline" size="sm" onClick={() => setEditing(t)}>
                      Edit
                    </Button>
                    {t.active ? (
                      <Button variant="ghost" size="sm" onClick={() => setConfirming(t)}>
                        Deactivate
                      </Button>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {editing ? (
        <TemplateEditorDialog
          key={editing === 'new' ? 'new' : editing.id}
          kind={kind}
          template={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}

      {confirming ? (
        <ConfirmDialog
          open
          onOpenChange={(next) => {
            if (!next) setConfirming(null);
          }}
          title={`Deactivate “${confirming.name}”?`}
          description={`The template stops being offered for new records. Existing ${
            kind.countField === 'checklists' ? 'checklists' : 'screenings'
          } keep their items — they hold snapshots and are never rewritten.`}
          confirmLabel="Deactivate"
          isPending={deactivate.isPending}
          error={deactivate.error ? deactivate.error.message : null}
          onConfirm={() => deactivate.mutate(confirming.id)}
        />
      ) : null}
    </div>
  );
}

// ── Editor ───────────────────────────────────────────────────────────────────

interface TemplateFormValues {
  name: string;
  isDefault: boolean;
  active: boolean;
  items: { label: string; sortOrder: number; required: boolean }[];
}

function TemplateEditorDialog({
  kind,
  template,
  onClose,
}: {
  kind: TemplateKind;
  template: TemplateRecord | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [topError, setTopError] = useState<string | null>(null);

  const form = useForm<TemplateFormValues>({
    resolver: zodResolver(kind.schema) as unknown as Resolver<TemplateFormValues>,
    defaultValues: template
      ? {
          name: template.name,
          isDefault: template.isDefault,
          active: template.active,
          items: [...template.items]
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((i) => ({ label: i.label, sortOrder: i.sortOrder, required: i.required })),
        }
      : {
          name: '',
          isDefault: false,
          active: true,
          items: [{ label: '', sortOrder: 0, required: true }],
        },
  });

  const { fields, append, remove, move } = useFieldArray({ control: form.control, name: 'items' });

  const save = useMutation({
    mutationFn: (payload: TemplateFormValues) =>
      template
        ? // PUT replaces items wholesale — the API has no per-item PATCH.
          api.put<TemplateRecord>(`${kind.basePath}/${template.id}`, payload)
        : api.post<TemplateRecord>(kind.basePath, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: kind.queryKey });
      onClose();
    },
    onError: (err) => setTopError(applyApiError(err, form.setError)),
  });

  const onSubmit = form.handleSubmit((values) => {
    setTopError(null);
    // Row position is the ordering truth; sortOrder is derived at save time.
    save.mutate({ ...values, items: values.items.map((i, idx) => ({ ...i, sortOrder: idx })) });
  });

  const { register, formState } = form;
  const itemErrors = formState.errors.items;

  return (
    <Dialog open onOpenChange={(next) => (!next ? onClose() : undefined)}>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>
            {template ? `Edit ${kind.noun}` : `New ${kind.noun}`}
          </DialogTitle>
          <DialogDescription>
            Changes apply to newly created records only — existing ones keep their snapshot of
            these {kind.itemNoun === 'item' ? 'items' : 'criteria'}.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 items-end gap-3">
            <FormField label="Name" required error={formState.errors.name}>
              <Input {...register('name')} />
            </FormField>
            <div className="flex items-center gap-5 pb-2">
              <Label className="flex items-center gap-2 font-normal">
                <Checkbox {...register('isDefault')} /> Default template
              </Label>
              <Label className="flex items-center gap-2 font-normal">
                <Checkbox {...register('active')} /> Active
              </Label>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Items</Label>
              <Button
                variant="outline"
                size="sm"
                onClick={() => append({ label: '', sortOrder: fields.length, required: true })}
              >
                <Plus className="h-3.5 w-3.5" /> Add {kind.itemNoun}
              </Button>
            </div>
            {typeof itemErrors?.message === 'string' ? (
              <p className="text-xs text-destructive">{itemErrors.message}</p>
            ) : null}
            {typeof itemErrors?.root?.message === 'string' ? (
              <p className="text-xs text-destructive">{itemErrors.root.message}</p>
            ) : null}
            <div className="space-y-2">
              {fields.map((field, idx) => (
                <div key={field.id} className="flex items-start gap-2 rounded-md border p-2">
                  <span className="mt-2 w-6 text-center text-xs text-muted-foreground">
                    {idx + 1}
                  </span>
                  <div className="flex-1">
                    <Input
                      placeholder={`${kind.itemNoun === 'item' ? 'Item' : 'Criterion'} label`}
                      {...register(`items.${idx}.label`)}
                    />
                    {itemErrors?.[idx]?.label?.message ? (
                      <p className="mt-1 text-xs text-destructive">
                        {itemErrors[idx]?.label?.message}
                      </p>
                    ) : null}
                  </div>
                  <Label className="mt-2 flex items-center gap-1.5 whitespace-nowrap text-xs font-normal">
                    <Checkbox {...register(`items.${idx}.required`)} /> Required
                  </Label>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      disabled={idx === 0}
                      onClick={() => move(idx, idx - 1)}
                      aria-label="Move up"
                    >
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      disabled={idx === fields.length - 1}
                      onClick={() => move(idx, idx + 1)}
                      aria-label="Move down"
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      disabled={fields.length <= 1}
                      onClick={() => remove(idx)}
                      aria-label="Remove"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <FormError message={topError} />

          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? 'Saving…' : template ? 'Save' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
