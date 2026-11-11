import "server-only";

import { MEDIA_BUCKET } from "@/lib/files";
import type { ServerClient } from "@/lib/supabase/server";

const SIGNED_URL_SECONDS = 60 * 60;

// Short-lived signed URLs for private objects, keyed by path. Paths the caller
// may not read are simply missing from the result.
export async function signedUrls(
  supabase: ServerClient,
  paths: (string | null | undefined)[],
): Promise<Map<string, string>> {
  const unique = [...new Set(paths.filter((path): path is string => Boolean(path)))];
  const urls = new Map<string, string>();
  if (unique.length === 0) return urls;
  const { data } = await supabase.storage
    .from(MEDIA_BUCKET)
    .createSignedUrls(unique, SIGNED_URL_SECONDS);
  for (const entry of data ?? []) {
    if (entry.path && entry.signedUrl) urls.set(entry.path, entry.signedUrl);
  }
  return urls;
}
