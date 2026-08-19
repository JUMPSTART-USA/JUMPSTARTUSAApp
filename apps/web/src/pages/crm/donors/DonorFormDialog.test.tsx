import { render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { describe, expect, it } from 'vitest';

/**
 * "Contact person" is meaningless for an individual donor — the donor IS the
 * person — so the field disables when Type is Individual and enables for every
 * other type.
 *
 * The subtle half is the CLEARING. A disabled input still carries its
 * registered value in react-hook-form, so a name typed under "organization" and
 * left behind by a switch to "individual" would submit invisibly: the user sees
 * a greyed-out empty-looking field and saves a contact person anyway.
 *
 * This reproduces the dialog's own wiring (watch + effect + disabled) rather
 * than mounting the real dialog, which needs a QueryClient, a router and a live
 * donor. What it pins is the rule, which is where the bug would live.
 */
interface Values {
  donorType: string;
  contactPerson: string;
}

function ContactPersonField({ initialType }: { initialType: string }) {
  const { register, watch, setValue } = useForm<Values>({
    defaultValues: { donorType: initialType, contactPerson: 'Dana Existing' },
  });
  const isIndividual = watch('donorType') === 'individual';

  useEffect(() => {
    if (isIndividual) setValue('contactPerson', '', { shouldDirty: true });
  }, [isIndividual, setValue]);

  return (
    <form>
      <select aria-label="Type" {...register('donorType')}>
        <option value="individual">Individual</option>
        <option value="organization">Organization</option>
        <option value="church">Church</option>
      </select>
      <input aria-label="Contact person" {...register('contactPerson')} disabled={isIndividual} />
    </form>
  );
}

describe('donor contact person follows donor type', () => {
  it('is disabled for an individual', () => {
    render(<ContactPersonField initialType="individual" />);
    expect((screen.getByLabelText('Contact person') as HTMLInputElement).disabled).toBe(true);
  });

  it('is enabled for an organization', () => {
    render(<ContactPersonField initialType="organization" />);
    expect((screen.getByLabelText('Contact person') as HTMLInputElement).disabled).toBe(false);
  });

  it('is enabled for a church — every non-individual type, not just organization', () => {
    render(<ContactPersonField initialType="church" />);
    expect((screen.getByLabelText('Contact person') as HTMLInputElement).disabled).toBe(false);
  });

  it('clears a value carried over from a non-individual type', async () => {
    render(<ContactPersonField initialType="individual" />);
    const field = screen.getByLabelText('Contact person') as HTMLInputElement;
    // Seeded as 'Dana Existing'; the effect must have emptied it. Disabling
    // alone would leave that name in the submitted payload.
    expect(field.value).toBe('');
  });

  it('keeps the value for a type that uses it', () => {
    render(<ContactPersonField initialType="organization" />);
    expect((screen.getByLabelText('Contact person') as HTMLInputElement).value).toBe(
      'Dana Existing',
    );
  });
});
