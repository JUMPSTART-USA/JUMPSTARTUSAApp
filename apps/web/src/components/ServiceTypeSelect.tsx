import { useQuery } from '@tanstack/react-query';
import { useState, type InputHTMLAttributes, type Ref } from 'react';
import { Input, Select } from '@/components/ui/input';
import { api } from '@/lib/api';

/**
 * The standard service menu (§6.5): options come from the `services.types`
 * app setting (Admin → Settings), falling back to the shared defaults, with
 * an "Other…" entry that switches to free text. One component so every
 * service-type field in the app renders the same menu.
 *
 * RHF wiring: pass watch('serviceType') as value, setValue in onChange, and
 * spread register('serviceType') into otherInputProps for the free-text mode.
 */
export function ServiceTypeSelect({
  value,
  onChange,
  otherInputProps,
}: {
  value: string;
  onChange: (value: string) => void;
  otherInputProps?: InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> };
}) {
  const typesQuery = useQuery({
    queryKey: ['case-management', 'service-types'],
    queryFn: () => api.get<{ types: string[] }>('/case-services/types'),
    staleTime: 300_000,
  });
  const types = (typesQuery.data?.types ?? []).filter((t) => t !== 'Other');
  const [manualOther, setManualOther] = useState(false);
  const otherMode = manualOther || (!!typesQuery.data && !!value && !types.includes(value));

  return (
    <div className="space-y-2">
      <Select
        value={otherMode ? '__other__' : value}
        onChange={(e) => {
          if (e.target.value === '__other__') {
            setManualOther(true);
            onChange('');
          } else {
            setManualOther(false);
            onChange(e.target.value);
          }
        }}
      >
        <option value="">Select a service…</option>
        {types.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
        <option value="__other__">Other…</option>
      </Select>
      {otherMode ? <Input placeholder="Describe the service" {...otherInputProps} /> : null}
    </div>
  );
}
