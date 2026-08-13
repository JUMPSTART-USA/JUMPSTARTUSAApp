import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Input } from './input';
import { PhoneInput } from './phone-input';
import { SearchInput } from './toolbar';

/**
 * The audit's input-ergonomics finding, done in the kit rather than at ~354 call
 * sites: a staff member entering a phone number on a phone should get a keypad,
 * and one entering an amount should get a decimal point, without anyone
 * remembering to ask for it.
 *
 * The last case is the one that matters most and is the least obvious — see the
 * autoComplete test.
 */

describe('the keyboard an Input raises', () => {
  it.each([
    ['email', 'email'],
    ['tel', 'tel'],
    ['url', 'url'],
  ])('gives type=%s an inputMode of %s', (type, expected) => {
    render(<Input type={type} aria-label="field" />);
    expect(screen.getByLabelText('field').getAttribute('inputmode')).toBe(expected);
  });

  it('reads `step` to tell money from a count', () => {
    // "0.01" is money and wants a decimal point; "1" is a count, where a decimal
    // keypad is a stray dot waiting to happen.
    render(<Input type="number" step="0.01" aria-label="amount" />);
    render(<Input type="number" step="1" aria-label="count" />);
    expect(screen.getByLabelText('amount').getAttribute('inputmode')).toBe('decimal');
    expect(screen.getByLabelText('count').getAttribute('inputmode')).toBe('numeric');
  });

  it('lets a call site override the derived value', () => {
    // Postal codes are typed as text (a leading zero must survive) but want a
    // numeric keypad, so the explicit prop has to win.
    render(<Input inputMode="numeric" aria-label="zip" />);
    expect(screen.getByLabelText('zip').getAttribute('inputmode')).toBe('numeric');
  });

  it('leaves an ordinary text field alone', () => {
    render(<Input aria-label="name" />);
    expect(screen.getByLabelText('name').getAttribute('inputmode')).toBeNull();
  });

  it('NEVER guesses autoComplete', () => {
    // The important one. Pairing type="email" with autoComplete="email" would be
    // wrong nearly everywhere in this app: most fields describe SOMEONE ELSE — a
    // participant's email, a vendor's phone — and the browser would offer the
    // staff member's own details for a record about someone in their caseload.
    render(<Input type="email" aria-label="participant email" />);
    expect(screen.getByLabelText('participant email').getAttribute('autocomplete')).toBeNull();
  });
});

describe('PhoneInput', () => {
  it('refuses autofill, because every phone field here is someone else’s', () => {
    // Measured on /participants/new before this: the participant's phone field
    // carried autoComplete="tel", so the browser offered the STAFF MEMBER's own
    // number while they typed a record about someone in their caseload.
    render(<PhoneInput aria-label="participant phone" />);
    expect(screen.getByLabelText('participant phone').getAttribute('autocomplete')).toBe('off');
  });

  it('still asks for a numeric keypad', () => {
    render(<PhoneInput aria-label="phone" />);
    expect(screen.getByLabelText('phone').getAttribute('inputmode')).toBe('numeric');
  });
});

describe('SearchInput', () => {
  it('asks for a Search key and refuses autofill', () => {
    render(<SearchInput aria-label="search" />);
    const box = screen.getByLabelText('search');
    expect(box.getAttribute('enterkeyhint')).toBe('search');
    // A list filter is not a form field; offering someone's saved name is noise.
    expect(box.getAttribute('autocomplete')).toBe('off');
  });
});
