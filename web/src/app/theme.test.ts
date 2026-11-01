import { expect, test } from "vitest";
import { isDark } from "./theme";

test.each([
  ["light", false, false],
  ["light", true, false],
  ["dark", false, true],
  ["system", false, false],
  ["system", true, true],
] as const)("preference %s with OS dark=%s → dark=%s", (pref, systemDark, want) => {
  expect(isDark(pref, systemDark)).toBe(want);
});
