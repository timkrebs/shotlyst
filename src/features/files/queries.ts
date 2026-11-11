import "server-only";

import { signedUrls } from "@/lib/storage";
import type { ServerClient } from "@/lib/supabase/server";

export async function listFiles(supabase: ServerClient, projectId: string) {
  const { data, error } = await supabase
    .from("files")
    .select(
      "id, path, name, mime, size, width, height, folder, kind, created_at, uploader:profiles!files_created_by_fkey(display_name)",
    )
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  const urls = await signedUrls(
    supabase,
    data.map((file) => file.path),
  );
  return data.map((file) => ({ ...file, url: urls.get(file.path) ?? null }));
}

export type ProjectFile = Awaited<ReturnType<typeof listFiles>>[number];
