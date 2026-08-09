import {
  HOME_GENDER_LABELS,
  HOME_GENDERS,
  transitionalHomeSchema,
  type HomeGender,
} from '@jumpstart/shared';
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
import { Checkbox, Input, Label, Select, Textarea } from '@/components/ui/input';
import { FormError } from '@/components/ui/notice';
import { PhoneInput } from '@/components/ui/phone-input';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { applyApiError, formResolver } from '@/lib/form';
import type { TransitionalHome } from './types';

interface HomeFormValues {
  name: string;
  addressLine1?: string;
  city?: string;
  state: string;
  zip?: string;
  phone?: string;
  houseManagerName?: string;
  houseManagerPhone?: string;
  houseManagerEmail?: string;
  capacity: number | string;
  gender: HomeGender;
  sexOffenderApproved: boolean;
  active: boolean;
  notes?: string;
}

function toDefaults(home: TransitionalHome | null, chapter: string | null): HomeFormValues {
  return {
    name: home?.name ?? '',
    addressLine1: home?.addressLine1 ?? '',
    city: home?.city ?? '',
    // Home state IS the chapter (§7.2): a scoped user's chapter is preset
    // (the picker is hidden for them); all-chapters users must choose.
    state: home?.state ?? chapter ?? '',
    zip: home?.zip ?? '',
    phone: home?.phone ?? '',
    houseManagerName: home?.houseManagerName ?? '',
    houseManagerPhone: home?.houseManagerPhone ?? '',
    houseManagerEmail: home?.houseManagerEmail ?? '',
    capacity: home?.capacity ?? '',
    gender: home?.gender ?? 'any',
    sexOffenderApproved: home?.sexOffenderApproved ?? false,
    active: home?.active ?? true,
    notes: home?.notes ?? '',
  };
}

export function HomeFormDialog({
  open,
  onOpenChange,
  home,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set the dialog edits; otherwise it creates. */
  home: TransitionalHome | null;
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
    formState: { errors },
  } = useForm<HomeFormValues>({
    resolver: formResolver<HomeFormValues>(transitionalHomeSchema),
    defaultValues: toDefaults(home, chapter),
  });

  useEffect(() => {
    if (open) {
      reset(toDefaults(home, chapter));
      setTopError(null);
    }
  }, [open, home, chapter, reset]);

  const mutation = useMutation({
    mutationFn: (values: HomeFormValues) =>
      home
        ? api.patch<TransitionalHome>(`/transitional-homes/${home.id}`, values)
        : api.post<TransitionalHome>('/transitional-homes', values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['housing'] });
      onOpenChange(false);
    },
    onError: (err) => setTopError(applyApiError(err, setError)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>{home ? 'Edit home' : 'New transitional home'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit((values) => mutation.mutate(values))} className="space-y-4">
          <FormError message={topError} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Name" required error={errors.name} className="sm:col-span-2">
              <Input {...register('name')} autoFocus />
            </FormField>
            <FormField label="Address" error={errors.addressLine1}>
              <Input {...register('addressLine1')} />
            </FormField>
            <FormField label="City" error={errors.city}>
              <Input {...register('city')} />
            </FormField>
            {/* Home state IS the chapter (§7.2) — hidden for scoped users,
                whose chapter is preset in the defaults. */}
            <ChapterSelect label="State (chapter)" error={errors.state} {...register('state')} />
            <FormField label="Zip" error={errors.zip}>
              <Input {...register('zip')} />
            </FormField>
            <FormField label="Phone" error={errors.phone}>
              <PhoneInput {...register('phone')} />
            </FormField>
            <FormField
              label="Capacity (beds)"
              required
              error={errors.capacity as { message?: string } | undefined}
              hint="Over-capacity move-ins warn, never block (§6.4)"
            >
              <Input type="number" min={1} {...register('capacity')} />
            </FormField>
            <FormField
              label="Gender"
              error={errors.gender}
              hint='"Any" means no resident-gender restriction'
            >
              <Select {...register('gender')}>
                {HOME_GENDERS.map((g) => (
                  <option key={g} value={g}>
                    {HOME_GENDER_LABELS[g]}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="House manager" error={errors.houseManagerName}>
              <Input {...register('houseManagerName')} />
            </FormField>
            <FormField label="Manager phone" error={errors.houseManagerPhone}>
              <PhoneInput {...register('houseManagerPhone')} />
            </FormField>
            <FormField label="Manager email" error={errors.houseManagerEmail}>
              <Input type="email" {...register('houseManagerEmail')} />
            </FormField>
            <div className="flex items-center gap-2 self-end pb-1.5">
              <Checkbox id="home-sex-offender-approved" {...register('sexOffenderApproved')} />
              <Label htmlFor="home-sex-offender-approved">Approved for sex offenders</Label>
            </div>
            <div className="flex items-center gap-2 self-end pb-1.5">
              <Checkbox id="home-active" {...register('active')} />
              <Label htmlFor="home-active">Active</Label>
            </div>
            <FormField label="Notes" error={errors.notes} className="sm:col-span-2">
              <Textarea rows={3} {...register('notes')} />
            </FormField>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Saving…' : home ? 'Save' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
