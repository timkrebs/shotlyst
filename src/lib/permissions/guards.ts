import "server-only";

import type { User } from "@supabase/supabase-js";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";

import { ActionError } from "@/lib/action";
import type { Tables } from "@/lib/db.types";
import { createClient, type ServerClient } from "@/lib/supabase/server";
import { en } from "@/messages/en";

import { effectiveProjectRole, hasProjectRole, isAdminRole, type ProjectRole } from "./roles";

export type Profile = Tables<"profiles">;

export interface MemberSession {
  supabase: ServerClient;
  user: User;
  profile: Profile;
}

export interface ProjectSession extends MemberSession {
  role: ProjectRole;
}

// The signed-in user and their profile, once per request. `profile` is null
// for an account that has no access (not invited, or invitation not finished).
export const getSession = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
  return { supabase, user, profile };
});

async function activeSession(): Promise<MemberSession | null> {
  const session = await getSession();
  if (!session?.profile || session.profile.deactivated_at) return null;
  return { supabase: session.supabase, user: session.user, profile: session.profile };
}

async function projectRole(session: MemberSession, projectId: string): Promise<ProjectRole | null> {
  if (isAdminRole(session.profile.workspace_role)) return "editor";
  const { data } = await session.supabase
    .from("project_members")
    .select("role")
    .eq("project_id", projectId)
    .eq("user_id", session.user.id)
    .maybeSingle();
  return effectiveProjectRole(session.profile.workspace_role, data?.role);
}

// --- Guards for Server Actions: throw an ActionError the client can show. ---

export async function requireMember(): Promise<MemberSession> {
  const session = await activeSession();
  if (!session) throw new ActionError(en.errors.notSignedIn);
  return session;
}

export async function requireAdmin(): Promise<MemberSession> {
  const session = await requireMember();
  if (!isAdminRole(session.profile.workspace_role)) throw new ActionError(en.errors.forbidden);
  return session;
}

export async function requireOwner(): Promise<MemberSession> {
  const session = await requireMember();
  if (session.profile.workspace_role !== "owner") throw new ActionError(en.errors.forbidden);
  return session;
}

export async function requireProjectRole(
  projectId: string,
  minimum: ProjectRole,
): Promise<ProjectSession> {
  const session = await requireMember();
  const role = await projectRole(session, projectId);
  if (!role || !hasProjectRole(role, minimum)) throw new ActionError(en.errors.forbidden);
  return { ...session, role };
}

// --- Guards for pages: redirect or 404 instead of throwing. ---

export async function requireMemberPage(): Promise<MemberSession> {
  const session = await activeSession();
  if (!session) redirect("/login");
  return session;
}

export async function requireAdminPage(): Promise<MemberSession> {
  const session = await requireMemberPage();
  if (!isAdminRole(session.profile.workspace_role)) redirect("/projects");
  return session;
}

// A project the caller cannot read does not exist for them.
export async function requireProjectPage(projectId: string): Promise<ProjectSession> {
  const session = await requireMemberPage();
  const role = await projectRole(session, projectId);
  if (!role) notFound();
  return { ...session, role };
}
