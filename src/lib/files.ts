// Pure helpers for the file library. Storage layout:
// `{project_id}/{area}/{uuid}.{ext}`, library media under `library/`.

export const MEDIA_BUCKET = "media";
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
export const MAX_IMAGE_EDGE = 2560;

export type FileKind = "image" | "pdf" | "video" | "file";

export function fileKind(mime: string): FileKind {
  if (mime.startsWith("image/")) return "image";
  if (mime === "application/pdf") return "pdf";
  if (mime.startsWith("video/")) return "video";
  return "file";
}

// Lower-case extension without the dot; "bin" when the name has none.
export function fileExtension(name: string): string {
  const match = /\.([A-Za-z0-9]{1,10})$/.exec(name);
  return match ? match[1].toLowerCase() : "bin";
}

export function storagePath(
  projectId: string | null,
  area: string,
  id: string,
  extension: string,
): string {
  return `${projectId ?? "library"}/${area}/${id}.${extension}`;
}

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const PATH = new RegExp(`^(${UUID}|library)/[a-z0-9-]+/${UUID}\\.[a-z0-9]{1,10}$`);

// True when the path follows the layout and belongs to the given project (or
// to the library when projectId is null).
export function isStoragePathFor(path: string, projectId: string | null): boolean {
  return PATH.test(path) && path.startsWith(`${projectId ?? "library"}/`);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

// Scales a size down so its longer edge is at most `maxEdge`; never up.
export function fitWithin(width: number, height: number, maxEdge: number) {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "";
  return (first + last).toUpperCase();
}

// Where the small preview of an image lives, next to the original.
export function thumbnailPath(path: string): string {
  return path.replace(/\.[a-z0-9]+$/, ".thumb.webp");
}
