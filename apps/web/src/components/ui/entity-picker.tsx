import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useDebounced } from '@/lib/form';
import { cn } from '@/lib/utils';

export interface PickerOption {
  id: string;
  label: string;
  sublabel?: string;
}

/**
 * Generic search-and-pick control: debounced typeahead, result list, selected
 * chip with a clear button. ParticipantPicker / VolunteerPicker in
 * @/components/pickers wrap this with their endpoints.
 */
export function EntityPicker({
  value,
  onChange,
  queryKey,
  search,
  placeholder = 'Search…',
  minChars = 2,
  disabled,
  className,
}: {
  value: PickerOption | null;
  onChange: (option: PickerOption | null) => void;
  /** Cache namespace, e.g. 'participant-picker'. */
  queryKey: string;
  search: (term: string) => Promise<PickerOption[]>;
  placeholder?: string;
  minChars?: number;
  disabled?: boolean;
  className?: string;
}) {
  const [q, setQ] = useState('');
  const term = useDebounced(q.trim());
  const enabled = !value && term.length >= minChars;
  const { data, isFetching } = useQuery({
    queryKey: ['entity-picker', queryKey, term],
    queryFn: () => search(term),
    enabled,
  });

  if (value) {
    return (
      <div
        className={cn(
          'flex items-center justify-between gap-2 rounded-md border bg-muted/40 px-3 py-1.5 text-sm',
          className,
        )}
      >
        <span className="min-w-0 truncate">
          {value.label}
          {value.sublabel ? (
            <span className="text-muted-foreground"> · {value.sublabel}</span>
          ) : null}
        </span>
        {!disabled ? (
          <Button
            variant="ghost"
            size="sm"
            className="-mr-2 shrink-0"
            onClick={() => onChange(null)}
          >
            <X className="h-3.5 w-3.5" /> Change
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className={cn('space-y-1.5', className)}>
      <Input
        placeholder={placeholder}
        value={q}
        disabled={disabled}
        onChange={(e) => setQ(e.target.value)}
      />
      {enabled ? (
        <div className="max-h-44 divide-y overflow-y-auto rounded-md border bg-card shadow-card">
          {isFetching ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">Searching…</div>
          ) : !data || data.length === 0 ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">No matches</div>
          ) : (
            data.map((option) => (
              <button
                key={option.id}
                type="button"
                className="block w-full px-3 py-2 text-left text-sm transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                onClick={() => onChange(option)}
              >
                {option.label}
                {option.sublabel ? (
                  <span className="text-muted-foreground"> · {option.sublabel}</span>
                ) : null}
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
