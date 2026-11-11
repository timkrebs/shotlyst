"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

import { projectPermissions, type ProjectPermissions, type ProjectRole } from "./roles";

interface ProjectAccess {
  projectId: string;
  role: ProjectRole | null;
}

const ProjectAccessContext = createContext<ProjectAccess | null>(null);

// Set by the project layout with the role resolved on the server.
export function ProjectAccessProvider({
  projectId,
  role,
  children,
}: ProjectAccess & { children: ReactNode }) {
  const value = useMemo(() => ({ projectId, role }), [projectId, role]);
  return <ProjectAccessContext.Provider value={value}>{children}</ProjectAccessContext.Provider>;
}

// What the current member may do in a project. The UI hides or disables
// controls with it; Server Actions and RLS enforce the same rules.
export function usePermissions(projectId: string): ProjectPermissions {
  const access = useContext(ProjectAccessContext);
  const role = access && access.projectId === projectId ? access.role : null;
  return useMemo(() => projectPermissions(role), [role]);
}
