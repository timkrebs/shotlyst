"use server";

import { revalidatePath } from "next/cache";

import { ActionError, defineAction } from "@/lib/action";
import { logActivity } from "@/lib/activity";
import { fileKind, isStoragePathFor, MEDIA_BUCKET, thumbnailPath } from "@/lib/files";
import { requireProjectRole } from "@/lib/permissions/guards";
import { en } from "@/messages/en";

import { fileIdSchema, registerFileSchema } from "./schema";

// Records a file the browser has already uploaded straight to storage. The
// storage policies decided whether that upload was allowed.
export const registerFile = defineAction(registerFileSchema, async (input) => {
  const { supabase, user } = await requireProjectRole(input.projectId, "editor");
  if (!isStoragePathFor(input.path, input.projectId)) {
    throw new ActionError(en.files.errors.registerFailed);
  }

  const { data, error } = await supabase
    .from("files")
    .insert({
      project_id: input.projectId,
      bucket: MEDIA_BUCKET,
      path: input.path,
      name: input.name,
      mime: input.mime,
      size: input.size,
      width: input.width,
      height: input.height,
      folder: input.folder,
      kind: fileKind(input.mime),
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error) throw new ActionError(en.files.errors.registerFailed);

  await logActivity(supabase, {
    projectId: input.projectId,
    action: "file.uploaded",
    entityType: "file",
    entityId: data.id,
    summary: en.activity.fileUploaded(input.name),
  });
  revalidatePath(`/projects/${input.projectId}/files`);
  return { id: data.id };
});

export const deleteFile = defineAction(fileIdSchema, async ({ projectId, fileId }) => {
  const { supabase } = await requireProjectRole(projectId, "editor");
  const { data: file } = await supabase
    .from("files")
    .select("id, path, name")
    .eq("id", fileId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (!file) throw new ActionError(en.errors.notFound);

  // The row goes first: a file still placed on a moodboard cannot be deleted,
  // and then the stored object must stay as well.
  const { error } = await supabase.from("files").delete().eq("id", fileId);
  if (error) {
    throw new ActionError(
      error.code === "23503" ? en.files.errors.inUse : en.files.errors.deleteFailed,
    );
  }
  const { error: storageError } = await supabase.storage
    .from(MEDIA_BUCKET)
    .remove([file.path, thumbnailPath(file.path)]);
  if (storageError) console.error("storage remove failed", storageError.message);

  await logActivity(supabase, {
    projectId,
    action: "file.deleted",
    entityType: "file",
    entityId: fileId,
    summary: en.activity.fileDeleted(file.name),
  });
  revalidatePath(`/projects/${projectId}`, "layout");
  revalidatePath("/projects");
});
