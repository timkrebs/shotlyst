import { expect, test } from "vitest";
import { t } from ".";

test("looks up nested keys", () => {
  expect(t("auth.login.title")).toBe("Log in");
});

test("fills placeholders and leaves unknown ones visible", () => {
  expect(t("nav.signedInAs", { name: "Kim" })).toBe("Signed in as Kim");
  expect(t("nav.signedInAs", {})).toBe("Signed in as {name}");
});
