/** `/meghivo/<64 hex characters>` — the page of an invitation. */
const INVITATION_PATH = /^\/meghivo\/([0-9a-f]{64})\/?$/;

/** The token of an invitation if `next` is the path of an invitation page, otherwise `null`. */
export function invitationTokenOf(next: string | null | undefined): string | null {
  return next ? (INVITATION_PATH.exec(next)?.[1] ?? null) : null;
}
