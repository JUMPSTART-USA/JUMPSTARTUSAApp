export interface MergeSource {
  firstName: string;
  lastName: string;
  preferredName: string | null;
  participantNumber: string | null;
  /** Assigned case manager's display name ("First Last"), when the person has one. */
  caseManager?: string | null;
}

/**
 * Renders {{firstName}} {{lastName}} {{preferredName}} {{participantNumber}}
 * {{caseManager}} {{today}} merge fields (§6.12). preferredName falls back to
 * firstName so letters never open with a blank; {{today}} is the render date
 * formatted for correspondence ("August 1, 2026").
 *
 * Unknown fields render as BLANK, not literal braces: rendered rows are the
 * literal content that leaves the building, and "Dear {{stafName}}" in an
 * outbound letter is worse than a missing word. Template previews surface
 * typos at authoring time instead.
 */
export function renderMergeFields(text: string, src: MergeSource): string {
  const values: Record<string, string> = {
    firstName: src.firstName,
    lastName: src.lastName,
    preferredName: src.preferredName ?? src.firstName,
    participantNumber: src.participantNumber ?? '',
    caseManager: src.caseManager ?? '',
    today: new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }),
  };
  return text.replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (_match, key: string) => values[key] ?? '');
}
