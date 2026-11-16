/**
 * The id of a tooth record, derived from the visit and the tooth number.
 *
 * Two devices that both start charting tooth 104 of the same visit must create
 * the SAME record, so their edits merge field by field instead of colliding on
 * the "one record per visit and tooth" rule. The id looks like a UUID (version
 * and variant bits set) so it fits the database's uuid column; it is a hash,
 * not a secret.
 */

/** cyrb128: a small, well-spread 128-bit string hash (public domain). */
function hash128(text: string): [number, number, number, number] {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    h1 = h2 ^ Math.imul(h1 ^ code, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ code, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ code, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ code, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  const mixed = h1 ^ h2 ^ h3 ^ h4;
  return [(mixed ^ h1) >>> 0, (mixed ^ h2) >>> 0, (mixed ^ h3) >>> 0, (mixed ^ h4) >>> 0];
}

export function toothRecordId(visitId: string, tooth: number): string {
  const hex = hash128(`${visitId.toLowerCase()}:${tooth}`)
    .map((part) => part.toString(16).padStart(8, "0"))
    .join("");
  const variant = "89ab"[parseInt(hex[16], 16) % 4];
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
