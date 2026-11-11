import { describe, expect, it } from "vitest";

import { isPublicPath, safeNextPath } from "./routes";

describe("isPublicPath", () => {
  it("exempts the auth pages, token links and cron", () => {
    for (const path of [
      "/login",
      "/accept-invite",
      "/reset-password",
      "/share/abc",
      "/api/cron/keepalive",
    ]) {
      expect(isPublicPath(path)).toBe(true);
    }
  });

  it("protects everything else, including look-alikes", () => {
    for (const path of ["/", "/projects", "/loginx", "/share", "/api/export/x", "/settings/members"]) {
      expect(isPublicPath(path)).toBe(false);
    }
  });
});

describe("safeNextPath", () => {
  it("keeps local paths", () => {
    expect(safeNextPath("/projects/1?tab=files")).toBe("/projects/1?tab=files");
  });

  it("rejects external and malformed targets", () => {
    expect(safeNextPath("https://evil.example")).toBe("/");
    expect(safeNextPath("//evil.example")).toBe("/");
    expect(safeNextPath("/\\evil.example")).toBe("/");
    expect(safeNextPath(null)).toBe("/");
  });
});
