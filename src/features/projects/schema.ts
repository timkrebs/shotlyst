import { z } from "zod";

import { isValidTimeZone } from "@/lib/format";
import { PROJECT_ROLES } from "@/lib/permissions/roles";
import { en } from "@/messages/en";

export const ASPECT_RATIOS = ["16:9", "9:16", "1:1", "4:5", "2.39:1"] as const;
export const PROJECT_KINDS = ["short_form", "narrative"] as const;
export const PROJECT_STATUSES = ["planning", "production", "post", "done"] as const;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, { error: en.validation.tooLong })
    .transform((value) => (value === "" ? null : value))
    .nullable();

const details = {
  name: z
    .string()
    .trim()
    .min(1, { error: en.validation.nameRequired })
    .max(120, { error: en.validation.nameTooLong }),
  projectNumber: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/, { error: en.validation.projectNumber }),
  clientId: z.uuid().nullable(),
  brandId: z.uuid().nullable(),
  aspectRatio: z.enum(ASPECT_RATIOS),
  timezone: z.string().refine(isValidTimeZone, { error: en.validation.timezone }),
  description: optionalText(2000),
};

export const createProjectSchema = z.object({ ...details, kind: z.enum(PROJECT_KINDS) });

export const updateProjectSchema = z.object({
  ...details,
  projectId: z.uuid(),
  status: z.enum(PROJECT_STATUSES),
});

export const projectIdSchema = z.object({ projectId: z.uuid() });
export const duplicateProjectSchema = z.object({
  projectId: z.uuid(),
  name: details.name,
  projectNumber: details.projectNumber,
});
export const archiveProjectSchema = z.object({ projectId: z.uuid(), archived: z.boolean() });
export const setCoverSchema = z.object({ projectId: z.uuid(), fileId: z.uuid().nullable() });

export const projectMemberSchema = z.object({
  projectId: z.uuid(),
  userId: z.uuid(),
  role: z.enum(PROJECT_ROLES),
});
export const removeProjectMemberSchema = z.object({ projectId: z.uuid(), userId: z.uuid() });
