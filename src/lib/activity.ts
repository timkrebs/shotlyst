import "server-only";

import type { ServerClient } from "@/lib/supabase/server";

interface ActivityEntry {
  projectId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  summary: string;
}

// Records who changed what. Called by every Server Action after its write. A
// failed log entry is reported but does not undo the write.
export async function logActivity(supabase: ServerClient, entry: ActivityEntry) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const { error } = await supabase.from("activity_log").insert({
    project_id: entry.projectId,
    actor_id: user.id,
    action: entry.action,
    entity_type: entry.entityType,
    entity_id: entry.entityId ?? null,
    summary: entry.summary,
  });
  if (error) console.error("activity_log insert failed", error.message);
}
