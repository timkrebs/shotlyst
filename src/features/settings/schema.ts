import { z } from "zod";

import { isValidTimeZone } from "@/lib/format";
import { en } from "@/messages/en";

export const EXPORT_LOGO_MAX_BYTES = 2 * 1024 * 1024;
export const EXPORT_LOGO_TYPES = ["image/png", "image/jpeg"];

export const workspaceSettingsSchema = z.object({
  defaultTimezone: z.string().refine(isValidTimeZone, { error: en.validation.timezone }),
  exportCompany: z.string().trim().max(200, { error: en.validation.tooLong }),
});

// The logo is uploaded by the browser to `library/branding/` first; the
// action receives only its storage path.
export const exportLogoSchema = z.object({
  path: z
    .string()
    .regex(/^library\/branding\/[0-9a-f-]{36}\.(png|jpg|jpeg)$/, { error: en.settings.errors.logoType }),
});

export const removeExportLogoSchema = z.object({});
