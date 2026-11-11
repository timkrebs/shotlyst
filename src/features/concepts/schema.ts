import { z } from "zod";

import { en } from "@/messages/en";

export const CONCEPT_TYPES = ["treatment", "brief", "note"] as const;
export const CONCEPT_STATUSES = ["draft", "final"] as const;
const MAX_CONTENT_BYTES = 2 * 1024 * 1024;

const title = z
  .string()
  .trim()
  .min(1, { error: en.validation.titleRequired })
  .max(200, { error: en.validation.tooLong });
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, { error: en.validation.tooLong })
    .transform((value) => (value === "" ? null : value));

export const createConceptSchema = z.object({
  projectId: z.uuid(),
  title,
  type: z.enum(CONCEPT_TYPES),
  folderId: z.uuid().nullable(),
});

export const updateConceptSchema = z.object({
  projectId: z.uuid(),
  conceptId: z.uuid(),
  title,
  type: z.enum(CONCEPT_TYPES),
  status: z.enum(CONCEPT_STATUSES),
  folderId: z.uuid().nullable(),
});

// The editor document. Its shape is the editor's own; only the envelope and
// the size are checked here.
export const saveConceptContentSchema = z.object({
  projectId: z.uuid(),
  conceptId: z.uuid(),
  content: z
    .object({ type: z.literal("doc"), content: z.array(z.unknown()).optional() })
    .refine((doc) => JSON.stringify(doc).length <= MAX_CONTENT_BYTES, {
      error: en.concepts.errors.tooLarge,
    }),
  // True for the first save of an editing session, which is the one logged.
  logEdit: z.boolean(),
});

export const conceptIdSchema = z.object({ projectId: z.uuid(), conceptId: z.uuid() });

export const saveFolderSchema = z.object({
  projectId: z.uuid(),
  folderId: z.uuid().nullable(),
  name: z
    .string()
    .trim()
    .min(1, { error: en.validation.nameRequired })
    .max(120, { error: en.validation.nameTooLong }),
});
export const folderIdSchema = z.object({ projectId: z.uuid(), folderId: z.uuid() });

export const saveBeatSchema = z
  .object({
    projectId: z.uuid(),
    conceptId: z.uuid(),
    beatId: z.uuid().nullable(),
    title,
    description: optionalText(2000),
    startSec: z.number().int().min(0).max(86400),
    endSec: z.number().int().min(1).max(86400),
  })
  .refine((beat) => beat.endSec > beat.startSec, { error: en.concepts.errors.beatWindow });
export const beatIdSchema = z.object({ projectId: z.uuid(), conceptId: z.uuid(), beatId: z.uuid() });

export const addBeatItemSchema = z.object({
  projectId: z.uuid(),
  conceptId: z.uuid(),
  beatId: z.uuid(),
  label: z
    .string()
    .trim()
    .min(1, { error: en.validation.titleRequired })
    .max(300, { error: en.validation.tooLong }),
});
export const toggleBeatItemSchema = z.object({
  projectId: z.uuid(),
  conceptId: z.uuid(),
  itemId: z.uuid(),
  done: z.boolean(),
});
export const beatItemIdSchema = z.object({
  projectId: z.uuid(),
  conceptId: z.uuid(),
  itemId: z.uuid(),
});
