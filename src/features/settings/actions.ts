"use server";

import { revalidatePath } from "next/cache";

import { downloadObject, getExportSettings } from "@/features/exports/queries";
import { ActionError, defineAction } from "@/lib/action";
import { logActivity } from "@/lib/activity";
import { MEDIA_BUCKET } from "@/lib/files";
import { readPdfImage } from "@/lib/pdf/files";
import { requireAdmin } from "@/lib/permissions/guards";
import type { ServerClient } from "@/lib/supabase/server";
import { en } from "@/messages/en";

import {
  EXPORT_LOGO_MAX_BYTES,
  exportLogoSchema,
  removeExportLogoSchema,
  workspaceSettingsSchema,
} from "./schema";

export const saveWorkspaceSettings = defineAction(
  workspaceSettingsSchema,
  async ({ defaultTimezone, exportCompany }) => {
    const { supabase, user } = await requireAdmin();
    const { error } = await supabase.from("app_settings").upsert(
      [
        { key: "default_timezone", value: defaultTimezone, created_by: user.id },
        { key: "export_company", value: exportCompany, created_by: user.id },
      ],
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

// A logo that is no longer referenced is removed from storage. Failing to
// remove it leaves an unused file behind, nothing more.
async function removeLogoObject(supabase: ServerClient, path: string | null) {
  if (path) await supabase.storage.from(MEDIA_BUCKET).remove([path]);
}

// Any member may upload under `library/`, so the path alone proves nothing:
// only an admin may make an upload the logo, and only after the file itself
// was checked.
export const setExportLogo = defineAction(exportLogoSchema, async ({ path }) => {
  const { supabase, user } = await requireAdmin();
  const bytes = await downloadObject(supabase, path);
  if (!bytes) throw new ActionError(en.settings.errors.logoFailed);
  if (bytes.length > EXPORT_LOGO_MAX_BYTES || !readPdfImage(bytes)) {
    await removeLogoObject(supabase, path);
    throw new ActionError(
      bytes.length > EXPORT_LOGO_MAX_BYTES
        ? en.settings.errors.logoTooLarge
        : en.settings.errors.logoType,
    );
  }

  const previous = (await getExportSettings(supabase)).logoPath;
  const { error } = await supabase
    .from("app_settings")
    .upsert({ key: "export_logo_path", value: path, created_by: user.id }, { onConflict: "key" });
  if (error) throw new ActionError(en.settings.errors.logoFailed);
  if (previous !== path) await removeLogoObject(supabase, previous);

  await logActivity(supabase, {
    projectId: null,
    action: "settings.export_logo_updated",
    entityType: "app_settings",
    summary: en.settings.logoUpdatedActivity,
  });
  revalidatePath("/settings/workspace");
});

export const removeExportLogo = defineAction(removeExportLogoSchema, async () => {
  const { supabase } = await requireAdmin();
  const previous = (await getExportSettings(supabase)).logoPath;
  const { error } = await supabase.from("app_settings").delete().eq("key", "export_logo_path");
  if (error) throw new ActionError(en.settings.errors.logoFailed);
  await removeLogoObject(supabase, previous);

  await logActivity(supabase, {
    projectId: null,
    action: "settings.export_logo_removed",
    entityType: "app_settings",
    summary: en.settings.logoRemovedActivity,
  });
  revalidatePath("/settings/workspace");
});
