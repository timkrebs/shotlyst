import { expect, test } from "vitest";
import { safeRedirect } from "./router";

test.each([
  ["/projects", "/projects"],
  ["/projects/1?tab=beats", "/projects/1?tab=beats"],
  ["//evil.example", undefined],
  ["/\\evil.example", undefined],
  ["https://evil.example/", undefined],
  ["projects", undefined],
  [42, undefined],
  [undefined, undefined],
])("safeRedirect(%j) = %j", (input, want) => {
  expect(safeRedirect(input)).toBe(want);
});
