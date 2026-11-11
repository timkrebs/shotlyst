import { z } from "zod";

import { ASPECT_RATIOS } from "@/features/projects/schema";
import { SHOT_TEXT_FIELDS } from "@/lib/shots/types";
import { en } from "@/messages/en";

const position = z.string().regex(/^[0-9A-Za-z]{1,64}$/);
const MAX_BATCH = 500;

const cellText = z
  .string()
  .max(4000, { error: en.validation.tooLong })
  .transform((value) => (value.trim() === "" ? null : value.trim()))
  .nullable();
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, { error: en.validation.tooLong })
    .transform((value) => (value === "" ? null : value));
const title = z
  .string()
  .trim()
  .min(1, { error: en.validation.titleRequired })
  .max(200, { error: en.validation.tooLong });

const textFields = Object.fromEntries(SHOT_TEXT_FIELDS.map((field) => [field, cellText.optional()])) as {
  [K in (typeof SHOT_TEXT_FIELDS)[number]]: z.ZodOptional<typeof cellText>;
};

// The fields of a shot a member may change. Only the fields that changed are
// sent, so two people editing different cells of one shot do not collide.
export const shotPatchSchema = z
  .object({
    ...textFields,
    duration_sec: z.number().int().min(0).max(86400).optional(),
    setup_min: z.number().int().min(0).max(1440).nullable().optional(),
    custom_values: z
      .record(
        z.string().regex(/^[a-z][a-z0-9_]{0,39}$/),
        z.union([z.string().max(2000), z.number(), z.boolean(), z.null()]),
      )
      .optional(),
  })
  .strict();

export type ShotPatch = z.infer<typeof shotPatchSchema>;

export const createShotSchema = z.object({
  projectId: z.uuid(),
  // Chosen by the client, so the row can show before the server answers.
  shotId: z.uuid(),
  segmentId: z.uuid(),
  position,
});

export const updateShotSchema = z.object({
  projectId: z.uuid(),
  shotId: z.uuid(),
  patch: shotPatchSchema.refine((patch) => Object.keys(patch).length > 0),
  // True for the first edit of a shot in an editing session, which is logged.
  logEdit: z.boolean(),
});

export const moveShotsSchema = z.object({
  projectId: z.uuid(),
  moves: z
    .array(z.object({ shotId: z.uuid(), segmentId: z.uuid(), position }))
    .min(1)
    .max(MAX_BATCH),
});

export const shotIdsSchema = z.object({
  projectId: z.uuid(),
  shotIds: z.array(z.uuid()).min(1).max(MAX_BATCH),
});

export const addCastSchema = z.object({
  projectId: z.uuid(),
  shotId: z.uuid(),
  name: z
    .string()
    .trim()
    .min(1, { error: en.validation.nameRequired })
    .max(120, { error: en.validation.nameTooLong }),
});
export const removeCastSchema = z.object({
  projectId: z.uuid(),
  shotId: z.uuid(),
  talentId: z.uuid(),
});

export const createSegmentSchema = z.object({
  projectId: z.uuid(),
  creativeId: z.uuid(),
  segmentId: z.uuid(),
  title,
  position,
});
export const updateSegmentSchema = z.object({
  projectId: z.uuid(),
  segmentId: z.uuid(),
  title,
  targetDurationSec: z.number().int().min(0).max(86400).nullable(),
});
export const moveSegmentSchema = z.object({ projectId: z.uuid(), segmentId: z.uuid(), position });
export const segmentIdSchema = z.object({ projectId: z.uuid(), segmentId: z.uuid() });

export const CREATIVE_STATUSES = ["draft", "in_review", "approved"] as const;
export const saveCreativeSchema = z.object({
  projectId: z.uuid(),
  creativeId: z.uuid().nullable(),
  title,
  status: z.enum(CREATIVE_STATUSES),
  goal: optionalText(2000),
  keyMessage: optionalText(2000),
  audience: optionalText(2000),
  mustHaves: optionalText(2000),
  noGos: optionalText(2000),
  aspectRatio: z.enum(ASPECT_RATIOS).nullable(),
});
export const creativeIdSchema = z.object({ projectId: z.uuid(), creativeId: z.uuid() });

export const CUSTOM_COLUMN_TYPES = ["text", "number", "select", "checkbox"] as const;
export const saveColumnSchema = z.object({
  projectId: z.uuid(),
  columnId: z.uuid().nullable(),
  label: z
    .string()
    .trim()
    .min(1, { error: en.validation.nameRequired })
    .max(60, { error: en.validation.nameTooLong }),
  type: z.enum(CUSTOM_COLUMN_TYPES),
  options: z.array(z.string().trim().min(1).max(60)).max(30),
});
export const columnIdSchema = z.object({ projectId: z.uuid(), columnId: z.uuid() });
export const setColumnVisibleSchema = z.object({
  projectId: z.uuid(),
  key: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/),
  visible: z.boolean(),
});

export const addFrameSchema = z.object({
  projectId: z.uuid(),
  shotId: z.uuid(),
  fileId: z.uuid(),
  source: z.enum(["upload", "reference"]),
});
export const setActiveFrameSchema = z.object({
  projectId: z.uuid(),
  shotId: z.uuid(),
  frameId: z.uuid(),
});
export const frameIdSchema = z.object({ projectId: z.uuid(), frameId: z.uuid() });

export const beatsToSegmentsSchema = z.object({
  projectId: z.uuid(),
  conceptId: z.uuid(),
});
