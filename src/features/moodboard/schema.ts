import { z } from "zod";

import { en } from "@/messages/en";

export const NODE_TYPES = ["image", "note", "text", "color", "link", "group"] as const;
export type BoardNodeType = (typeof NODE_TYPES)[number];

const MAX_BATCH = 500;
const coordinate = z.number().finite().min(-1e7).max(1e7);
const size = z.number().finite().positive().max(1e5);
const smallJson = z
  .record(z.string(), z.unknown())
  .refine((value) => JSON.stringify(value).length <= 20_000, { error: en.validation.tooLong });

export const nodeRowSchema = z.object({
  id: z.uuid(),
  type: z.enum(NODE_TYPES),
  x: coordinate,
  y: coordinate,
  width: size,
  height: size,
  z: z.number().int().min(-100000).max(100000),
  data: smallJson,
  fileId: z.uuid().nullable(),
});

export const edgeRowSchema = z.object({
  id: z.uuid(),
  sourceNodeId: z.uuid(),
  targetNodeId: z.uuid(),
  style: smallJson,
});

// One batch of changes from the canvas: rows to write and rows to remove.
export const saveBoardSchema = z.object({
  projectId: z.uuid(),
  boardId: z.uuid(),
  nodes: z.array(nodeRowSchema).max(MAX_BATCH),
  edges: z.array(edgeRowSchema).max(MAX_BATCH),
  removedNodeIds: z.array(z.uuid()).max(MAX_BATCH),
  removedEdgeIds: z.array(z.uuid()).max(MAX_BATCH),
  // True for the first save of an editing session, which is the one logged.
  logEdit: z.boolean(),
});

const title = z
  .string()
  .trim()
  .min(1, { error: en.validation.nameRequired })
  .max(120, { error: en.validation.nameTooLong });

export const createBoardSchema = z.object({ projectId: z.uuid(), title });
export const renameBoardSchema = z.object({ projectId: z.uuid(), boardId: z.uuid(), title });
export const boardIdSchema = z.object({ projectId: z.uuid(), boardId: z.uuid() });

export type NodeRow = z.infer<typeof nodeRowSchema>;
export type EdgeRow = z.infer<typeof edgeRowSchema>;
