import type { Enums } from "@/lib/db.types";

export type WorkspaceRole = Enums<"workspace_role">;
export type ProjectRole = Enums<"project_role">;

export const WORKSPACE_ROLES = ["owner", "admin", "member"] as const satisfies WorkspaceRole[];
export const INVITABLE_WORKSPACE_ROLES = ["member", "admin"] as const satisfies WorkspaceRole[];
export const PROJECT_ROLES = ["editor", "commenter", "viewer"] as const satisfies ProjectRole[];

export function isAdminRole(role: WorkspaceRole | null | undefined): boolean {
  return role === "owner" || role === "admin";
}

// Owner and admin act as editor in every project; everyone else has the role
// of their project_members row, or none.
export function effectiveProjectRole(
  workspaceRole: WorkspaceRole | null | undefined,
  membershipRole: ProjectRole | null | undefined,
): ProjectRole | null {
  if (isAdminRole(workspaceRole)) return "editor";
  return membershipRole ?? null;
}

const RANK: Record<ProjectRole, number> = { viewer: 1, commenter: 2, editor: 3 };

export function hasProjectRole(role: ProjectRole | null, minimum: ProjectRole): boolean {
  return role !== null && RANK[role] >= RANK[minimum];
}

export interface ProjectPermissions {
  role: ProjectRole | null;
  canRead: boolean;
  canComment: boolean;
  canEdit: boolean;
  canExport: boolean;
  canManageMembers: boolean;
}

// Mirrors private.can_read / can_comment / can_edit in the database. The UI
// uses it to hide controls; the database enforces it regardless.
export function projectPermissions(role: ProjectRole | null): ProjectPermissions {
  return {
    role,
    canRead: hasProjectRole(role, "viewer"),
    canComment: hasProjectRole(role, "commenter"),
    canEdit: hasProjectRole(role, "editor"),
    canExport: hasProjectRole(role, "viewer"),
    canManageMembers: hasProjectRole(role, "editor"),
  };
}
