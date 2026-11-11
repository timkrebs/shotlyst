import { z } from "zod";

import { MAX_UPLOAD_BYTES } from "@/lib/files";
import { en } from "@/messages/en";

export const registerFileSchema = z.object({
  projectId: z.uuid(),
  path: z.string().min(1).max(300),
  name: z.string().trim().min(1).max(255),
  mime: z.string().min(1).max(127),
  size: z.number().int().min(0).max(MAX_UPLOAD_BYTES, { error: en.files.errors.tooLarge }),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  folder: z
    .string()
    .trim()
    .max(80, { error: en.validation.tooLong })
    .transform((value) => (value === "" ? null : value))
    .nullable(),
});

export const fileIdSchema = z.object({ projectId: z.uuid(), fileId: z.uuid() });
