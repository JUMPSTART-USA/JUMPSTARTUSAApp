export interface MergeSource {
  firstName: string;
  lastName: string;
  preferredName: string | null;
  participantNumber: string | null;
}

/**
 * Renders {{firstName}} {{lastName}} {{preferredName}} {{participantNumber}}
 * merge fields (§6.12). preferredName falls back to firstName so letters never
 * open with a blank; unknown fields are left untouched so template typos are
 * visible in previews rather than silently swallowed.
 */
export function renderMergeFields(text: string, src: MergeSource): string {
  const values: Record<string, string> = {
    firstName: src.firstName,
    lastName: src.lastName,
    preferredName: src.preferredName ?? src.firstName,
    participantNumber: src.participantNumber ?? '',
  };
  return text.replace(
    /\{\{\s*(firstName|lastName|preferredName|participantNumber)\s*\}\}/g,
    (_match, key: string) => values[key] ?? '',
  );
}
