"use server";

import { revalidatePath } from "next/cache";

import { ActionError, defineAction } from "@/lib/action";
import { logActivity } from "@/lib/activity";
import { isStoragePathFor, MEDIA_BUCKET } from "@/lib/files";
import { requireMember } from "@/lib/permissions/guards";
import { en } from "@/messages/en";

import { setAvatarSchema, updateProfileSchema } from "./schema";

export const updateProfile = defineAction(updateProfileSchema, async ({ displayName, color }) => {
  const { supabase, user } = await requireMember();
  const { data, error } = await supabase
    .from("profiles")
    .update({ display_name: displayName, color })
    .eq("id", user.id)
    .select("id")
    .maybeSingle();
  if (error || !data) throw new ActionError(en.profile.errors.saveFailed);

  await logActivity(supabase, {
    projectId: null,
    action: "profile.updated",
    entityType: "profile",
    entityId: user.id,
    summary: en.activity.profileUpdated(displayName),
  });
  revalidatePath("/", "layout");
});

// Points the profile at an avatar the browser has uploaded under
// `library/avatars/` and removes the previous one.
export const setAvatar = defineAction(setAvatarSchema, async (input) => {
  const { supabase, user, profile } = await requireMember();
  if (!isStoragePathFor(input.path, null) || !input.path.startsWith("library/avatars/")) {
    throw new ActionError(en.profile.errors.saveFailed);
  }

  const { data: file, error } = await supabase
    .from("files")
    .insert({
      project_id: null,
      bucket: MEDIA_BUCKET,
      path: input.path,
      name: input.name,
      mime: input.mime,
      size: input.size,
      width: input.width,
      height: input.height,
      kind: "image",
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error) throw new ActionError(en.profile.errors.saveFailed);

  const { error: updateError } = await supabase
    .from("profiles")
    .update({ avatar_file_id: file.id })
    .eq("id", user.id);
  if (updateError) throw new ActionError(en.profile.errors.saveFailed);

  if (profile.avatar_file_id) {
    const { data: previous } = await supabase
      .from("files")
      .delete()
      .eq("id", profile.avatar_file_id)
      .select("path")
      .maybeSingle();
    if (previous) await supabase.storage.from(MEDIA_BUCKET).remove([previous.path]);
  }

  await logActivity(supabase, {
    projectId: null,
    action: "profile.avatar_changed",
    entityType: "profile",
    entityId: user.id,
    summary: en.activity.avatarChanged(profile.display_name),
  });
  revalidatePath("/", "layout");
});
