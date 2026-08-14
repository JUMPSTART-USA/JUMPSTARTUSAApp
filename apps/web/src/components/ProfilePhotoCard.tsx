import {
  isAllowedProfilePhotoType,
  MAX_PROFILE_PHOTO_BYTES,
  PROFILE_PHOTO_ACCEPT,
} from '@jumpstart/shared';
import { useMutation } from '@tanstack/react-query';
import { Camera, Trash2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeaderRow } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { FormError } from '@/components/ui/notice';
import { api, ApiError } from '@/lib/api';

/**
 * The one profile-photo surface: preview + upload/replace + remove for
 * participants, volunteers and donors. `photoPath` is the API photo endpoint
 * (e.g. /participants/:id/photo) — GET streams the image (session cookie
 * rides along on the same-origin <img> request), PUT replaces, DELETE clears.
 */
export function ProfilePhotoCard({
  photoPath,
  personName,
  hasPhoto,
  canEdit,
  onChanged,
}: {
  photoPath: string;
  /** For the <img> alt text. */
  personName: string;
  /** From the record (photoMimeType != null) — avoids a guaranteed-404 fetch. */
  hasPhoto: boolean;
  canEdit: boolean;
  /** Invalidate the record query so hasPhoto stays honest on refetch. */
  onChanged?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Local override until the parent's query refetches; the version param
  // forces a fresh <img> load after a replace (the API is no-store anyway,
  // but the browser reuses the rendered image without a src change).
  const [override, setOverride] = useState<boolean | null>(null);
  const [version, setVersion] = useState(0);
  // Render-time state reset: detail pages stay mounted across same-route
  // navigation (donor → household member is /donors/:id → /donors/:id), and a
  // stale override/version would misreport the NEXT record's photo.
  const [lastPath, setLastPath] = useState(photoPath);
  if (lastPath !== photoPath) {
    setLastPath(photoPath);
    setOverride(null);
    setVersion(0);
    setError(null);
    setConfirmOpen(false);
  }
  const showPhoto = override ?? hasPhoto;

  const upload = useMutation({
    mutationFn: (file: File) => {
      const body = new FormData();
      body.append('photo', file);
      return api.put(photoPath, body);
    },
    onSuccess: () => {
      setOverride(true);
      setVersion((v) => v + 1);
      onChanged?.();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Upload failed'),
  });

  const remove = useMutation({
    mutationFn: () => api.delete(photoPath),
    onSuccess: () => {
      setOverride(false);
      onChanged?.();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Remove failed'),
  });

  const onFileChosen = (file: File | undefined) => {
    if (!file) return;
    setError(null);
    // Mirror the API's multer checks so the common failures never round-trip.
    if (!isAllowedProfilePhotoType(file.type)) {
      setError('Choose an image file (JPEG, PNG, GIF, WebP, HEIC, TIFF or BMP).');
      return;
    }
    if (file.size > MAX_PROFILE_PHOTO_BYTES) {
      setError(`Photo is too large — the limit is ${MAX_PROFILE_PHOTO_BYTES / (1024 * 1024)} MB.`);
      return;
    }
    upload.mutate(file);
  };

  const pending = upload.isPending || remove.isPending;

  return (
    <Card>
      <CardHeaderRow title="Photo" />
      <CardContent className="flex items-start gap-4">
        {showPhoto ? (
          <img
            key={version}
            src={`/api${photoPath}?v=${version}`}
            alt={`Photo of ${personName}`}
            className="h-28 w-28 shrink-0 rounded-md border object-cover"
          />
        ) : (
          <div className="flex h-28 w-28 shrink-0 items-center justify-center rounded-md border bg-muted/40 text-muted-foreground">
            <Camera className="h-8 w-8" aria-hidden />
          </div>
        )}
        <div className="min-w-0 space-y-2">
          {canEdit ? (
            <>
              <input
                ref={inputRef}
                type="file"
                accept={PROFILE_PHOTO_ACCEPT}
                className="hidden"
                onChange={(e) => {
                  onFileChosen(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() => inputRef.current?.click()}
                >
                  <Upload className="h-4 w-4" />
                  {upload.isPending ? 'Uploading…' : showPhoto ? 'Replace photo' : 'Upload photo'}
                </Button>
                {showPhoto ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={pending}
                    onClick={() => setConfirmOpen(true)}
                  >
                    <Trash2 className="h-4 w-4" />
                    Remove
                  </Button>
                ) : null}
              </div>
              <p className="text-xs text-muted-foreground">
                JPEG, PNG, GIF, WebP, HEIC, TIFF or BMP — up to 10 MB.
              </p>
            </>
          ) : showPhoto ? null : (
            <p className="text-sm text-muted-foreground">No photo on file.</p>
          )}
          <FormError message={error} />
        </div>
      </CardContent>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Remove photo?"
        description={`Removes the stored photo for ${personName}.`}
        confirmLabel="Remove"
        onConfirm={() => remove.mutate()}
      />
    </Card>
  );
}
