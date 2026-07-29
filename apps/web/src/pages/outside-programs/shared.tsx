/**
 * Domain helpers shared by the Outside Programs and Housing areas (both owned
 * by this module group — Housing imports from here rather than duplicating).
 * Generic form helpers live in @/lib/form; generic UI in @/components/ui.
 */
import { fullName } from '@/lib/utils';
import type { ParticipantRef } from './types';

/** register(..., { setValueAs: emptyToUndef }) for optional enum/uuid/number selects. */
export const emptyToUndef = (v: unknown) => (v === '' || v === null ? undefined : v);

export function participantLabel(p: ParticipantRef): string {
  return `${fullName(p.person)} · ${p.participantNumber}`;
}
