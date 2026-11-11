import "server-only";

import type { ServerClient } from "@/lib/supabase/server";

const RECENT_PROJECTS = 6;

// Projects with the latest activity the caller can see, most recent first.
export async function listRecentProjects(supabase: ServerClient) {
  const { data, error } = await supabase
    .from("activity_log")
    .select("created_at, project:projects(id, name, project_number, archived_at)")
    .not("project_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);

  const seen = new Map<string, { id: string; name: string; projectNumber: string; at: string }>();
  for (const entry of data) {
    const project = entry.project;
    if (!project || project.archived_at || seen.has(project.id)) continue;
    seen.set(project.id, {
      id: project.id,
      name: project.name,
      projectNumber: project.project_number,
      at: entry.created_at,
    });
    if (seen.size === RECENT_PROJECTS) break;
  }
  return [...seen.values()];
}
