// Browser-side: crops an image to the project's aspect ratio before upload.

import type { PreparedFile } from "@/features/files/upload";
import { fitWithin, MAX_IMAGE_EDGE } from "@/lib/files";
import { centreCrop } from "@/lib/shots/aspect";

export async function cropToAspect(file: File, ratio: number): Promise<PreparedFile> {
  const bitmap = await createImageBitmap(file);
  const crop = centreCrop(bitmap.width, bitmap.height, ratio);
  const size = fitWithin(crop.width, crop.height, MAX_IMAGE_EDGE);
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  canvas
    .getContext("2d")
    ?.drawImage(bitmap, crop.x, crop.y, crop.width, crop.height, 0, 0, size.width, size.height);
  bitmap.close();

  // PNG stays PNG (it may be a drawing); everything else becomes JPEG, which
  // the PDF export can embed.
  const mime = file.type === "image/png" ? "image/png" : "image/jpeg";
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime, 0.9));
  if (!blob) throw new Error("crop failed");
  const name = file.name.replace(/\.[^.]+$/, "") + (mime === "image/png" ? ".png" : ".jpg");
  return { blob, name, mime, width: size.width, height: size.height };
}
