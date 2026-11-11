import { z } from "zod";

import { en } from "@/messages/en";

export const TASK_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

const title = z
  .string()
  .trim()
  .min(1, { error: en.validation.titleRequired })
  .max(300, { error: en.validation.tooLong });
const position = z.string().regex(/^[0-9A-Za-z]{1,64}$/);

export const createTaskSchema = z.object({
  projectId: z.uuid(),
  sectionId: z.uuid(),
  parentTaskId: z.uuid().nullable(),
  title,
});

export const updateTaskSchema = z.object({
  projectId: z.uuid(),
  taskId: z.uuid(),
  title,
  description: z
    .string()
    .trim()
    .max(5000, { error: en.validation.tooLong })
    .transform((value) => (value === "" ? null : value)),
  assigneeId: z.uuid().nullable(),
  priority: z.enum(TASK_PRIORITIES),
  labels: z
    .array(z.string().trim().min(1).max(40))
    .max(12)
    .transform((labels) => [...new Set(labels)]),
  // A calendar day, YYYY-MM-DD.
  dueDate: z.iso.date().nullable(),
});

export const moveTaskSchema = z.object({
  projectId: z.uuid(),
  taskId: z.uuid(),
  sectionId: z.uuid(),
  position,
});

export const taskIdSchema = z.object({ projectId: z.uuid(), taskId: z.uuid() });
export const setTaskCompletedSchema = z.object({
  projectId: z.uuid(),
  taskId: z.uuid(),
  completed: z.boolean(),
});
export const renameSectionSchema = z.object({
  projectId: z.uuid(),
  sectionId: z.uuid(),
  name: z
    .string()
    .trim()
    .min(1, { error: en.validation.nameRequired })
    .max(60, { error: en.validation.nameTooLong }),
});
