import {
  ATTACHMENT_ACCEPT,
  ATTACHMENT_SENSITIVITIES,
  ATTACHMENT_SENSITIVITY_LABELS,
  isAllowedAttachmentType,
  MAX_ATTACHMENT_BYTES,
  type AttachmentEntityType,
  type AttachmentSensitivity,
} from '@jumpstart/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Paperclip, Trash2, Upload } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { FormField } from '@/components/FormField';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeaderRow } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input, Select } from '@/components/ui/input';
import { FormError } from '@/components/ui/notice';
import { ErrorState, Spinner } from '@/components/ui/spinner';
import { api, qs } from '@/lib/api';
import { applyApiError } from '@/lib/form';
import { formatDate } from '@/lib/utils';

/** List row returned by GET /attachments (never includes file bytes). */
export interface AttachmentItem {
  id: string;
  entityType: string;
  entityId: string;
  filename: string;
  contentType: string | null;
  sizeBytes: number | null;
  sensitivity: AttachmentSensitivity;
  uploadedById: string | null;
  createdAt: string;
}

const SENSITIVITY_BADGES: Record<AttachmentSensitivity, 'warning' | 'destructive' | 'secondary'> = {
  standard: 'secondary', // never rendered — standard rows show no badge
  sensitive: 'warning',
  confidential: 'destructive',
};

function formatBytes(n: number | null | undefined): string {
  if (n == null) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * The one attachments surface: list + download + upload + delete for any
 * entity that supports documents. `compact` drops the Card chrome for use
 * inside dialogs (maintenance receipts, training/clearance evidence).
 */
export function AttachmentsCard({
  entityType,
  entityId,
  title = 'Attachments',
  canUpload,
  canDelete,
  compact = false,
}: {
  entityType: AttachmentEntityType;
  entityId: string;
  title?: string;
  canUpload: boolean;
  canDelete: boolean;
  compact?: boolean;
}) {
  const queryClient = useQueryClient();
  const queryKey = ['attachments', entityType, entityId];
  const [uploadOpen, setUploadOpen] = useState(false);
  const [deleting, setDeleting] = useState<AttachmentItem | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: () => api.get<AttachmentItem[]>(`/attachments${qs({ entityType, entityId })}`),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/attachments/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
      setDeleting(null);
    },
  });

  const items = data ?? [];

  const uploadButton = canUpload ? (
    <Button variant="outline" size="sm" onClick={() => setUploadOpen(true)}>
      <Upload className="h-4 w-4" /> Upload
    </Button>
  ) : null;

  const body = (
    <>
      {error ? <ErrorState error={error} /> : null}
      {isLoading ? (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      ) : items.length === 0 && !error ? (
        <p className="py-2 text-sm text-muted-foreground">No files attached yet.</p>
      ) : (
        <ul className="divide-y">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-3 py-2.5">
              <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <a
                    href={`/api/attachments/${item.id}/download`}
                    target="_blank"
                    rel="noreferrer"
                    className="truncate text-sm font-medium hover:underline"
                  >
                    {item.filename}
                  </a>
                  {item.sensitivity !== 'standard' ? (
                    <Badge variant={SENSITIVITY_BADGES[item.sensitivity]}>
                      {ATTACHMENT_SENSITIVITY_LABELS[item.sensitivity]}
                    </Badge>
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground">
                  {formatBytes(item.sizeBytes)} · {formatDate(item.createdAt)}
                </p>
              </div>
              {canDelete ? (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete ${item.filename}`}
                  onClick={() => {
                    remove.reset();
                    setDeleting(item);
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </>
  );

  const dialogs = (
    <>
      <UploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        entityType={entityType}
        entityId={entityId}
        onUploaded={() => void queryClient.invalidateQueries({ queryKey })}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(next) => {
          if (!next) setDeleting(null);
        }}
        title="Delete attachment"
        description={
          deleting
            ? `Delete "${deleting.filename}"? The record is retained for audit but removed from this list.`
            : undefined
        }
        isPending={remove.isPending}
        error={remove.error ? remove.error.message : null}
        onConfirm={() => {
          if (deleting) remove.mutate(deleting.id);
        }}
      />
    </>
  );

  if (compact) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium">{title}</p>
          {uploadButton}
        </div>
        {body}
        {dialogs}
      </div>
    );
  }

  return (
    <Card>
      <CardHeaderRow title={title}>{uploadButton}</CardHeaderRow>
      <CardContent>{body}</CardContent>
      {dialogs}
    </Card>
  );
}

function UploadDialog({
  open,
  onOpenChange,
  entityType,
  entityId,
  onUploaded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityType: AttachmentEntityType;
  entityId: string;
  onUploaded: () => void;
}): ReactNode {
  const [file, setFile] = useState<File | null>(null);
  const [sensitivity, setSensitivity] = useState<AttachmentSensitivity>('standard');
  const [topError, setTopError] = useState<string | null>(null);
  // Remounts the native file input when the dialog reopens after an upload.
  const [inputKey, setInputKey] = useState(0);

  const upload = useMutation({
    mutationFn: (selected: File) => {
      const form = new FormData();
      form.append('file', selected);
      form.append('entityType', entityType);
      form.append('entityId', entityId);
      form.append('sensitivity', sensitivity);
      return api.post('/attachments', form);
    },
    onSuccess: () => {
      onUploaded();
      setFile(null);
      setSensitivity('standard');
      setTopError(null);
      setInputKey((k) => k + 1);
      onOpenChange(false);
    },
    onError: (err) => setTopError(applyApiError(err)),
  });

  const handleSubmit = () => {
    setTopError(null);
    if (!file) {
      setTopError('Choose a file to upload.');
      return;
    }
    if (file.size > MAX_ATTACHMENT_BYTES) {
      setTopError('File is too large — the limit is 15 MB.');
      return;
    }
    // Browsers leave type blank for unrecognized extensions; let the API's
    // allowlist make the final call in that case.
    if (file.type && !isAllowedAttachmentType(file.type)) {
      setTopError('File type not allowed — images, PDF, Office documents, text and CSV only.');
      return;
    }
    upload.mutate(file);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Upload file</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
          className="space-y-4"
          noValidate
        >
          <FormField label="File" required hint="Up to 15 MB — images, PDF, Office documents, text or CSV.">
            <Input
              key={inputKey}
              type="file"
              accept={ATTACHMENT_ACCEPT}
              className="h-auto py-1.5 file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-2.5 file:py-1 file:text-xs file:font-medium"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </FormField>
          <FormField
            label="Sensitivity"
            hint="Confidential files are visible only to staff with confidential-notes access."
          >
            <Select
              value={sensitivity}
              onChange={(e) => setSensitivity(e.target.value as AttachmentSensitivity)}
            >
              {ATTACHMENT_SENSITIVITIES.map((s) => (
                <option key={s} value={s}>
                  {ATTACHMENT_SENSITIVITY_LABELS[s]}
                </option>
              ))}
            </Select>
          </FormField>

          <FormError message={topError} />

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={upload.isPending || !file}>
              {upload.isPending ? 'Uploading…' : 'Upload'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
