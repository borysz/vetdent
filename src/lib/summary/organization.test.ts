import { describe, expect, test } from "vitest";
import { formatAddress, MAX_SUMMARY_PHOTOS, parsePhotoIds } from "./organization";

describe("formatAddress", () => {
  test("puts the postal code and city first", () => {
    expect(formatAddress({ postalCode: "1011", city: "Budapest", addressLine: "Fő utca 1." })).toBe("1011 Budapest, Fő utca 1.");
  });
  test("leaves out what is missing", () => {
    expect(formatAddress({ postalCode: null, city: "Győr", addressLine: null })).toBe("Győr");
    expect(formatAddress({ postalCode: " ", city: null, addressLine: "" })).toBeNull();
  });
});

describe("parsePhotoIds", () => {
  const a = "11111111-1111-4111-8111-111111111111";
  const b = "22222222-2222-4222-8222-222222222222";
  test("keeps valid ids once each", () => {
    expect(parsePhotoIds(`${a},${b},${a.toUpperCase()}`)).toEqual([a, b]);
  });
  test("drops anything that is not an id", () => {
    expect(parsePhotoIds(`${a},abc,../x,,'; drop`)).toEqual([a]);
    expect(parsePhotoIds(null)).toEqual([]);
  });
  test("takes a limited number", () => {
    const many = Array.from({ length: 40 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
    expect(parsePhotoIds(many.join(","))).toHaveLength(MAX_SUMMARY_PHOTOS);
  });
});
