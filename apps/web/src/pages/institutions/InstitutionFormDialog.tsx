import { institutionSchema } from '@jumpstart/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { ChapterSelect } from '@/components/ChapterSelect';
import { FormField } from '@/components/FormField';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Checkbox, Input, Textarea } from '@/components/ui/input';
import { FormError } from '@/components/ui/notice';
import { PhoneInput } from '@/components/ui/phone-input';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { applyApiError, formResolver } from '@/lib/form';
import type { Institution } from './types';

interface InstitutionFormValues {
  name: string;
  institutionType: string;
  addressLine1: string;
  city: string;
  state: string;
  zip: string;
  mainPhone: string;
  notes: string;
  active: boolean;
}

function buildDefaults(
  institution: Institution | undefined,
  chapter: string | null,
): InstitutionFormValues {
  return {
    name: institution?.name ?? '',
    institutionType: institution?.institutionType ?? '',
    addressLine1: institution?.addressLine1 ?? '',
    city: institution?.city ?? '',
    // Facility state IS the chapter (§7.2): a scoped user's chapter is preset
    // (the picker is hidden for them); all-chapters users choose it.
    state: institution?.state ?? chapter ?? '',
    zip: institution?.zip ?? '',
    mainPhone: institution?.mainPhone ?? '',
    notes: institution?.notes ?? '',
    active: institution?.active ?? true,
  };
}

export function InstitutionFormDialog({
  open,
  onOpenChange,
  institution,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Edit mode when present, create mode otherwise. */
  institution?: Institution;
}) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const chapter = user?.chapter ?? null;
  const [topError, setTopError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<InstitutionFormValues>({
    resolver: formResolver<InstitutionFormValues>(institutionSchema),
    defaultValues: buildDefaults(institution, chapter),
  });

  useEffect(() => {
    if (open) {
      reset(buildDefaults(institution, chapter));
      setTopError(null);
    }
  }, [open, institution, chapter, reset]);

  const mutation = useMutation({
    mutationFn: (values: InstitutionFormValues) =>
      institution
        ? api.patch<Institution>(`/institutions/${institution.id}`, values)
        : api.post<Institution>('/institutions', values),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['institutions'] });
      onOpenChange(false);
    },
    onError: (err) => setTopError(applyApiError(err, setError)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>{institution ? 'Edit institution' : 'New institution'}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={handleSubmit((values) => mutation.mutate(values))}
          className="space-y-4"
          noValidate
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Name" required error={errors.name} className="sm:col-span-2">
              <Input {...register('name')} autoFocus />
            </FormField>
            <FormField label="Institution type" error={errors.institutionType}>
              <Input {...register('institutionType')} placeholder="e.g. State prison, work release" />
            </FormField>
            <FormField label="Main phone" error={errors.mainPhone}>
              <PhoneInput {...register('mainPhone')} />
            </FormField>
            <FormField label="Address" error={errors.addressLine1} className="sm:col-span-2">
              <Input {...register('addressLine1')} />
            </FormField>
            <FormField label="City" error={errors.city}>
              <Input {...register('city')} />
            </FormField>
            {/* Chapter names are long ("South Carolina") — give the select the
                wider slot so it is not truncated next to the short ZIP. */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-[3fr_2fr]">
              {/* Facility state IS the chapter (§7.2) — hidden for scoped
                  users, whose chapter is preset in the defaults. */}
              <ChapterSelect label="State (chapter)" error={errors.state} {...register('state')} />
              <FormField label="ZIP" error={errors.zip}>
                <Input inputMode="numeric" {...register('zip')} />
              </FormField>
            </div>
          </div>

          <FormField label="Notes" error={errors.notes}>
            <Textarea rows={3} {...register('notes')} />
          </FormField>

          <label className="flex items-center gap-2 text-sm">
            <Checkbox {...register('active')} />
            Active — currently partnering with JUMPSTART
          </label>

          <p className="text-xs text-muted-foreground">
            Contact people (chaplains, wardens, coordinators…) are managed on the institution's
            profile page.
          </p>

          <FormError message={topError} />

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || mutation.isPending}>
              {mutation.isPending ? 'Saving…' : institution ? 'Save' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
