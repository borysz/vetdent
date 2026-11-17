/** The practice's contact lines for the head of the summary: address on one line, the rest as entered. */
export interface OrganizationContact {
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
}

export function formatAddress(parts: { postalCode: string | null; city: string | null; addressLine: string | null }): string | null {
  const place = [parts.postalCode, parts.city].filter((part): part is string => Boolean(part?.trim())).join(" ");
  const full = [place, parts.addressLine?.trim()].filter((part): part is string => Boolean(part)).join(", ");
  return full === "" ? null : full;
}

/** Which photos the request asks for (`?fotok=id1,id2`): only well-formed ids, no repeats, at most `max`. */
export const MAX_SUMMARY_PHOTOS = 12;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parsePhotoIds(value: string | null | undefined): string[] {
  if (!value) return [];
  const ids = value
    .split(",")
    .map((id) => id.trim().toLowerCase())
    .filter((id) => UUID.test(id));
  return [...new Set(ids)].slice(0, MAX_SUMMARY_PHOTOS);
}
