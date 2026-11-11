import { describe, expect, it } from "vitest";

import { effectiveProjectRole, hasProjectRole, isAdminRole, projectPermissions } from "./roles";

describe("effectiveProjectRole", () => {
  it("makes owner and admin editors of every project", () => {
    expect(effectiveProjectRole("owner", null)).toBe("editor");
    expect(effectiveProjectRole("admin", "viewer")).toBe("editor");
  });

  it("gives a member their membership role, or none", () => {
    expect(effectiveProjectRole("member", "commenter")).toBe("commenter");
    expect(effectiveProjectRole("member", null)).toBeNull();
    expect(effectiveProjectRole(null, "editor")).toBe("editor");
  });
});

describe("hasProjectRole", () => {
  it("orders viewer < commenter < editor", () => {
    expect(hasProjectRole("editor", "viewer")).toBe(true);
    expect(hasProjectRole("commenter", "editor")).toBe(false);
    expect(hasProjectRole("viewer", "viewer")).toBe(true);
    expect(hasProjectRole(null, "viewer")).toBe(false);
  });
});

describe("projectPermissions", () => {
  it("lets a viewer read and export only", () => {
    expect(projectPermissions("viewer")).toMatchObject({
      canRead: true,
      canExport: true,
      canComment: false,
      canEdit: false,
      canManageMembers: false,
    });
  });

  it("lets a commenter comment but not edit", () => {
    expect(projectPermissions("commenter")).toMatchObject({ canComment: true, canEdit: false });
  });

  it("lets an editor do everything", () => {
    expect(projectPermissions("editor")).toMatchObject({ canEdit: true, canManageMembers: true });
  });

  it("gives nothing without a role", () => {
    expect(projectPermissions(null)).toMatchObject({ canRead: false, canExport: false });
  });
});

describe("isAdminRole", () => {
  it("is true for owner and admin only", () => {
    expect(isAdminRole("owner")).toBe(true);
    expect(isAdminRole("admin")).toBe(true);
    expect(isAdminRole("member")).toBe(false);
    expect(isAdminRole(null)).toBe(false);
  });
});
