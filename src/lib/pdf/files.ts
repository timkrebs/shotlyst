// Pure helpers for exports: download names, and reading the format and size
// of an image from its first bytes. The PDF renderer draws only PNG and JPEG.

export interface PdfImage {
  data: Buffer;
  format: "png" | "jpg";
  width: number;
  height: number;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function pngSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 24 || PNG_SIGNATURE.some((byte, index) => bytes[index] !== byte)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

// Walks the JPEG segments to the frame header, which carries the size.
function jpegSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1];
    // Padding and markers without a length.
    if (marker === 0xff) {
      offset += 1;
      continue;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      offset += 2;
      continue;
    }
    const isFrameHeader =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isFrameHeader) {
      return { height: view.getUint16(offset + 5), width: view.getUint16(offset + 7) };
    }
    offset += 2 + view.getUint16(offset + 2);
  }
  return null;
}

// Null for anything that is not a readable PNG or JPEG (WebP, SVG, broken
// files), so the caller can leave the image out.
export function readPdfImage(bytes: Uint8Array): PdfImage | null {
  const png = pngSize(bytes);
  const size = png ?? jpegSize(bytes);
  if (!size || size.width === 0 || size.height === 0) return null;
  return { data: Buffer.from(bytes), format: png ? "png" : "jpg", ...size };
}

// The largest size of the given proportions inside a box.
export function fitInside(width: number, height: number, maxWidth: number, maxHeight: number) {
  const scale = Math.min(maxWidth / width, maxHeight / height);
  return { width: width * scale, height: height * scale };
}

export function slugify(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// "2026-001", "Main film", "shot-list", "pdf" -> "2026-001-main-film-shot-list.pdf"
export function exportFilename(parts: string[], extension: string): string {
  const name = parts.map(slugify).filter(Boolean).join("-").slice(0, 120);
  return `${name || "export"}.${extension}`;
}

export function attachmentHeaders(filename: string, contentType: string): HeadersInit {
  return {
    "Content-Type": contentType,
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "private, no-store",
  };
}
