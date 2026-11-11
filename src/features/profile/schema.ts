import { z } from "zod";

import { displayName } from "@/features/auth/schema";
import { en } from "@/messages/en";

export const updateProfileSchema = z.object({
  displayName,
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, { error: en.validation.color }),
});

export const setAvatarSchema = z.object({
  path: z.string().min(1).max(300),
  name: z.string().trim().min(1).max(255),
  mime: z.string().regex(/^image\//, { error: en.profile.errors.avatarType }),
  size: z.number().int().min(0).max(5 * 1024 * 1024, { error: en.profile.errors.avatarTooLarge }),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
});
