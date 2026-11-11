// Browser-side upload helpers. Files go straight to Supabase Storage; no file
// bytes pass through a Server Action.

import { fileExtension, fitWithin, MAX_IMAGE_EDGE, MEDIA_BUCKET, storagePath } from "@/lib/files";
import { createClient } from "@/lib/supabase/client";

const RESIZABLE = new Set(["image/jpeg", "image/png", "image/webp"]);

export interface PreparedFile {
  blob: Blob;
  name: string;
  mime: string;
  width: number | null;
  height: number | null;
}

// Reads image dimensions and downsizes large photos so the longer edge is at
// most 2,560 px. Other files pass through untouched.
export async function prepareFile(file: File): Promise<PreparedFile> {
  const mime = file.type || "application/octet-stream";
  const untouched = { blob: file, name: file.name, mime, width: null, height: null };
  if (!mime.startsWith("image/") || mime === "image/svg+xml") return untouched;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return untouched;
  }
  const { width, height } = bitmap;
  const target = fitWithin(width, height, MAX_IMAGE_EDGE);
  if (!RESIZABLE.has(mime) || target.width === width) {
    bitmap.close();
    return { ...untouched, width, height };
  }

  const canvas = document.createElement("canvas");
  canvas.width = target.width;
  canvas.height = target.height;
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, target.width, target.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime, 0.9));
  if (!blob) return { ...untouched, width, height };
  return { blob, name: file.name, mime, width: target.width, height: target.height };
}

// Uploads a prepared file and returns its storage path.
export async function uploadToStorage(
  prepared: PreparedFile,
  projectId: string | null,
  area: string,
): Promise<string> {
  const path = storagePath(projectId, area, crypto.randomUUID(), fileExtension(prepared.name));
  const { error } = await createClient()
    .storage.from(MEDIA_BUCKET)
    .upload(path, prepared.blob, { contentType: prepared.mime, cacheControl: "3600" });
  if (error) throw new Error(error.message);
  return path;
}
