import { describe, expect, test } from "vitest";
import { MAX_FILE_BYTES, checkFile, fitWithin, isImage } from "./attachment-file";

describe("what may be attached", () => {
  test("JPEG, PNG, WebP and PDF are fine", () => {
    for (const type of ["image/jpeg", "image/png", "image/webp", "application/pdf"]) {
      expect(checkFile({ type, size: 1000 })).toBeNull();
    }
  });

  test("anything else is refused by type", () => {
    for (const type of ["image/gif", "image/svg+xml", "text/html", "application/zip", "application/x-sh", ""]) {
      expect(checkFile({ type, size: 1000 })).toBe("type");
    }
  });

  test("an empty file and a file over the limit are refused", () => {
    expect(checkFile({ type: "image/png", size: 0 })).toBe("empty");
    expect(checkFile({ type: "image/png", size: MAX_FILE_BYTES })).toBeNull();
    expect(checkFile({ type: "image/png", size: MAX_FILE_BYTES + 1 })).toBe("size");
  });

  test("only images are scaled", () => {
    expect(isImage("image/webp")).toBe(true);
    expect(isImage("application/pdf")).toBe(false);
  });
});

describe("scaling a photo", () => {
  test("the longest side is brought down to the limit, the proportions kept", () => {
    expect(fitWithin(4000, 3000, 2000)).toEqual({ width: 2000, height: 1500 });
    expect(fitWithin(3000, 4000, 2000)).toEqual({ width: 1500, height: 2000 });
  });

  test("a small image is never enlarged", () => {
    expect(fitWithin(800, 600, 2560)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(2560, 1000, 2560)).toEqual({ width: 2560, height: 1000 });
  });

  test("a very thin image keeps at least one pixel", () => {
    expect(fitWithin(10000, 2, 100)).toEqual({ width: 100, height: 1 });
  });
});
