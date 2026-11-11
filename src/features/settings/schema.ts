import { z } from "zod";

import { isValidTimeZone } from "@/lib/format";
import { en } from "@/messages/en";

export const workspaceSettingsSchema = z.object({
  defaultTimezone: z.string().refine(isValidTimeZone, { error: en.validation.timezone }),
});
