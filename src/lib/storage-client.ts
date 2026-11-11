"use client";

import { useEffect, useState } from "react";

import { MEDIA_BUCKET } from "@/lib/files";
import { createClient } from "@/lib/supabase/client";

// Signed URLs for private objects, resolved in the browser with the member's
// own session. Requests made in the same tick are sent as one batch, and
// results are reused until shortly before they expire.

const LIFETIME_SECONDS = 60 * 60;
const REUSE_MS = 50 * 60 * 1000;

const cache = new Map<string, { url: string | null; at: number }>();
let pending = new Map<string, ((url: string | null) => void)[]>();
let scheduled = false;

async function flush() {
  const batch = pending;
  pending = new Map();
  scheduled = false;
  const paths = [...batch.keys()];
  const { data } = await createClient()
    .storage.from(MEDIA_BUCKET)
    .createSignedUrls(paths, LIFETIME_SECONDS);
  const urls = new Map((data ?? []).map((entry) => [entry.path, entry.signedUrl || null]));
  for (const [path, resolvers] of batch) {
    const url = urls.get(path) ?? null;
    cache.set(path, { url, at: Date.now() });
    for (const resolve of resolvers) resolve(url);
  }
}

export function resolveSignedUrl(path: string): Promise<string | null> {
  const cached = cache.get(path);
  if (cached && Date.now() - cached.at < REUSE_MS) return Promise.resolve(cached.url);
  return new Promise((resolve) => {
    pending.set(path, [...(pending.get(path) ?? []), resolve]);
    if (!scheduled) {
      scheduled = true;
      setTimeout(() => void flush(), 10);
    }
  });
}

// The signed URL for a path, or null while it loads or when access is denied.
export function useSignedUrl(path: string | null | undefined): string | null {
  const [resolved, setResolved] = useState<{ path: string; url: string | null } | null>(null);
  useEffect(() => {
    if (!path) return;
    let active = true;
    void resolveSignedUrl(path).then((url) => {
      if (active) setResolved({ path, url });
    });
    return () => {
      active = false;
    };
  }, [path]);
  return path && resolved?.path === path ? resolved.url : null;
}
