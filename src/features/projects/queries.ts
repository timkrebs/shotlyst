import "server-only";

import { signedUrls } from "@/lib/storage";
import type { ServerClient } from "@/lib/supabase/server";

const MEMBER_FIELDS =
  "user_id, role, profile:profiles!project_members_user_id_fkey(display_name, color, deactivated_at, avatar:files!profiles_avatar_file_id_fkey(path))";

// Projects the caller may read (RLS decides), newest first.
export async function listProjects(supabase: ServerClient, archived: boolean) {
  let query = supabase
    .from("projects")
    .select(
      `id, name, project_number, kind, status, archived_at,
       client:clients(name),
       cover:files!projects_cover_file_id_fkey(path),
       members:project_members(${MEMBER_FIELDS})`,
    )
    .order("created_at", { ascending: false });
  query = archived ? query.not("archived_at", "is", null) : query.is("archived_at", null);
  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const urls = await signedUrls(supabase, [
    ...data.map((project) => project.cover?.path),
    ...data.flatMap((project) => project.members.map((member) => member.profile.avatar?.path)),
  ]);
  return data.map((project) => ({
    ...project,
    coverUrl: project.cover ? (urls.get(project.cover.path) ?? null) : null,
    members: project.members.map((member) => ({
      ...member,
      avatarUrl: member.profile.avatar ? (urls.get(member.profile.avatar.path) ?? null) : null,
    })),
  }));
}

export async function getProject(supabase: ServerClient, projectId: string) {
  const { data, error } = await supabase
    .from("projects")
    .select("*, client:clients(id, name), brand:brands(id, name)")
    .eq("id", projectId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function listProjectMembers(supabase: ServerClient, projectId: string) {
  const { data, error } = await supabase
    .from("project_members")
    .select(MEMBER_FIELDS)
    .eq("project_id", projectId)
    .order("created_at");
  if (error) throw new Error(error.message);
  const urls = await signedUrls(
    supabase,
    data.map((member) => member.profile.avatar?.path),
  );
  return data.map((member) => ({
    userId: member.user_id,
    role: member.role,
    displayName: member.profile.display_name,
    color: member.profile.color,
    deactivated: member.profile.deactivated_at !== null,
    avatarUrl: member.profile.avatar ? (urls.get(member.profile.avatar.path) ?? null) : null,
  }));
}

export async function listProjectActivity(supabase: ServerClient, projectId: string) {
  const { data, error } = await supabase
    .from("activity_log")
    .select("id, summary, created_at, actor:profiles(display_name)")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(15);
  if (error) throw new Error(error.message);
  return data;
}

export async function listProjectOptions(supabase: ServerClient) {
  const { data, error } = await supabase
    .from("projects")
    .select("id, name")
    .is("archived_at", null)
    .order("name");
  if (error) throw new Error(error.message);
  return data;
}

export async function getDefaultTimezone(supabase: ServerClient): Promise<string> {
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "default_timezone")
    .maybeSingle();
  return typeof data?.value === "string" ? data.value : "UTC";
}

export type ProjectListItem = Awaited<ReturnType<typeof listProjects>>[number];
export type ProjectDetails = NonNullable<Awaited<ReturnType<typeof getProject>>>;
export type ProjectMember = Awaited<ReturnType<typeof listProjectMembers>>[number];
