import { z } from "zod";

import { emailSchema } from "@/features/auth/schema";
import { INVITABLE_WORKSPACE_ROLES, PROJECT_ROLES } from "@/lib/permissions/roles";
import { en } from "@/messages/en";

export const inviteSchema = z
  .object({
    email: emailSchema,
    workspaceRole: z.enum(INVITABLE_WORKSPACE_ROLES),
    projectId: z.uuid().nullable(),
    projectRole: z.enum(PROJECT_ROLES).nullable(),
  })
  .refine((value) => (value.projectId === null) === (value.projectRole === null), {
    error: en.members.errors.projectRoleRequired,
  });

export const invitationIdSchema = z.object({ invitationId: z.uuid() });
export const memberIdSchema = z.object({ userId: z.uuid() });
export const changeRoleSchema = z.object({
  userId: z.uuid(),
  role: z.enum(INVITABLE_WORKSPACE_ROLES),
});
