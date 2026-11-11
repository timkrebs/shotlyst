import "server-only";

import type { ServerClient } from "@/lib/supabase/server";

// Member directory with email and last sign-in. Owner and admin only.
export async function listMembers(supabase: ServerClient) {
  const { data, error } = await supabase.rpc("list_members");
  if (error) throw new Error(error.message);
  return data;
}

export async function listPendingInvitations(supabase: ServerClient) {
  const { data, error } = await supabase
    .from("invitations")
    .select("id, email, workspace_role, project_role, expires_at, created_at, project:projects(name)")
    .is("accepted_at", null)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data;
}

// Active members, for pickers. Readable by every member.
export async function listActiveProfiles(supabase: ServerClient) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name, color")
    .is("deactivated_at", null)
    .order("display_name");
  if (error) throw new Error(error.message);
  return data;
}

export type Member = Awaited<ReturnType<typeof listMembers>>[number];
export type PendingInvitation = Awaited<ReturnType<typeof listPendingInvitations>>[number];
export type ActiveProfile = Awaited<ReturnType<typeof listActiveProfiles>>[number];
