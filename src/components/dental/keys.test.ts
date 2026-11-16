import { describe, expect, test } from "vitest";
import messages from "../../../messages/hu.json";
import { CODES } from "@/domain/dental/codes";
import { DEFAULT_QUICK_BUTTONS } from "@/domain/dental/quick-buttons";

const dental = messages.dental as unknown as {
  codes: Record<string, string>;
  levels: Record<string, Record<string, string>>;
  quick: Record<string, string>;
};

describe("the texts of the dental codes", () => {
  test("every code has a name", () => {
    for (const { code } of CODES) expect(dental.codes[code], `codes.${code}`).toBeTruthy();
  });

  test("every grade and subtype has a text", () => {
    for (const { code, levels } of CODES) {
      for (const level of levels) expect(dental.levels[code]?.[level], `levels.${code}.${level}`).toBeTruthy();
    }
  });

  test("every quick button has a label", () => {
    for (const { id } of DEFAULT_QUICK_BUTTONS) expect(dental.quick[id], `quick.${id}`).toBeTruthy();
  });
});
