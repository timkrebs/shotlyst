"use server";

import { revalidatePath } from "next/cache";

import { ActionError, defineAction } from "@/lib/action";
import { logActivity } from "@/lib/activity";
import { requireAdmin } from "@/lib/permissions/guards";
import { en } from "@/messages/en";

import { workspaceSettingsSchema } from "./schema";

export const saveWorkspaceSettings = defineAction(
  workspaceSettingsSchema,
  async ({ defaultTimezone }) => {
    const { supabase, user } = await requireAdmin();
    const { error } = await supabase
      .from("app_settings")
      .upsert(
        { key: "default_timezone", value: defaultTimezone, created_by: user.id },
        { onConflict: "key" },
      );
    if (error) throw new ActionError(en.settings.errors.saveFailed);

    await logActivity(supabase, {
      projectId: null,
      action: "settings.updated",
      entityType: "app_settings",
      summary: en.activity.settingsUpdated,
    });
    revalidatePath("/settings/workspace");
  },
);
