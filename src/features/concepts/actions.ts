"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { ActionError, defineAction } from "@/lib/action";
import { logActivity } from "@/lib/activity";
import type { Json } from "@/lib/db.types";
import { requireProjectRole } from "@/lib/permissions/guards";
import { comparePositions, positionAfter } from "@/lib/position";
import { en } from "@/messages/en";

import {
  addBeatItemSchema,
  beatIdSchema,
  beatItemIdSchema,
  conceptIdSchema,
  createConceptSchema,
  folderIdSchema,
  saveBeatSchema,
  saveConceptContentSchema,
  saveFolderSchema,
  toggleBeatItemSchema,
  updateConceptSchema,
} from "./schema";

const listPath = (projectId: string) => `/projects/${projectId}/concepts`;
const conceptPath = (projectId: string, conceptId: string) =>
  `/projects/${projectId}/concepts/${conceptId}`;

function lastPosition(rows: { position: string }[] | null): string | null {
  return (rows ?? []).map((row) => row.position).sort(comparePositions).at(-1) ?? null;
}

export const createConcept = defineAction(createConceptSchema, async (input) => {
  const { supabase, user } = await requireProjectRole(input.projectId, "editor");
  const { data, error } = await supabase
    .from("concepts")
    .insert({
      project_id: input.projectId,
      title: input.title,
      type: input.type,
      folder_id: input.folderId,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error) throw new ActionError(en.concepts.errors.saveFailed);

  await logActivity(supabase, {
    projectId: input.projectId,
    action: "concept.created",
    entityType: "concept",
    entityId: data.id,
    summary: en.activity.conceptCreated(input.title),
  });
  revalidatePath(listPath(input.projectId));
  redirect(conceptPath(input.projectId, data.id));
});

export const updateConcept = defineAction(updateConceptSchema, async (input) => {
  const { supabase } = await requireProjectRole(input.projectId, "editor");
  const { data, error } = await supabase
    .from("concepts")
    .update({
      title: input.title,
      type: input.type,
      status: input.status,
      folder_id: input.folderId,
    })
    .eq("id", input.conceptId)
    .eq("project_id", input.projectId)
    .select("id")
    .maybeSingle();
  if (error || !data) throw new ActionError(en.concepts.errors.saveFailed);

  await logActivity(supabase, {
    projectId: input.projectId,
    action: "concept.updated",
    entityType: "concept",
    entityId: input.conceptId,
    summary: en.activity.conceptUpdated(input.title),
  });
  revalidatePath(listPath(input.projectId));
  revalidatePath(conceptPath(input.projectId, input.conceptId));
});

// Continuous saving from the editor. Does not revalidate: the editor already
// shows the text it sent.
export const saveConceptContent = defineAction(saveConceptContentSchema, async (input) => {
  const { supabase } = await requireProjectRole(input.projectId, "editor");
  const { data, error } = await supabase
    .from("concepts")
    .update({ content: input.content as NonNullable<Json> })
    .eq("id", input.conceptId)
    .eq("project_id", input.projectId)
    .select("id, title")
    .maybeSingle();
  if (error || !data) throw new ActionError(en.concepts.errors.saveFailed);

  if (input.logEdit) {
    await logActivity(supabase, {
      projectId: input.projectId,
      action: "concept.edited",
      entityType: "concept",
      entityId: input.conceptId,
      summary: en.activity.conceptEdited(data.title),
    });
  }
});

// Makes this concept the active one; the previous one is deactivated in the
// same transaction.
export const setActiveConcept = defineAction(conceptIdSchema, async ({ projectId, conceptId }) => {
  const { supabase } = await requireProjectRole(projectId, "editor");
  const { error } = await supabase.rpc("set_active_concept", { p_concept_id: conceptId });
  if (error) throw new ActionError(en.concepts.errors.saveFailed);

  await logActivity(supabase, {
    projectId,
    action: "concept.activated",
    entityType: "concept",
    entityId: conceptId,
    summary: en.activity.conceptActivated,
  });
  revalidatePath(listPath(projectId));
  revalidatePath(conceptPath(projectId, conceptId));
});

export const deleteConcept = defineAction(conceptIdSchema, async ({ projectId, conceptId }) => {
  const { supabase } = await requireProjectRole(projectId, "editor");
  // A project always keeps its active concept.
  const { data, error } = await supabase
    .from("concepts")
    .delete()
    .eq("id", conceptId)
    .eq("project_id", projectId)
    .eq("is_active", false)
    .select("id, title")
    .maybeSingle();
  if (error) throw new ActionError(en.concepts.errors.deleteFailed);
  if (!data) throw new ActionError(en.concepts.errors.deleteActive);

  await logActivity(supabase, {
    projectId,
    action: "concept.deleted",
    entityType: "concept",
    entityId: conceptId,
    summary: en.activity.conceptDeleted(data.title),
  });
  revalidatePath(listPath(projectId));
});

export const saveConceptFolder = defineAction(saveFolderSchema, async (input) => {
  const { supabase, user } = await requireProjectRole(input.projectId, "editor");
  if (input.folderId) {
    const { data, error } = await supabase
      .from("concept_folders")
      .update({ name: input.name })
      .eq("id", input.folderId)
      .eq("project_id", input.projectId)
      .select("id")
      .maybeSingle();
    if (error || !data) throw new ActionError(en.concepts.errors.saveFailed);
  } else {
    const { data: folders } = await supabase
      .from("concept_folders")
      .select("position")
      .eq("project_id", input.projectId);
    const { error } = await supabase.from("concept_folders").insert({
      project_id: input.projectId,
      name: input.name,
      position: positionAfter(lastPosition(folders)),
      created_by: user.id,
    });
    if (error) throw new ActionError(en.concepts.errors.saveFailed);
  }

  await logActivity(supabase, {
    projectId: input.projectId,
    action: input.folderId ? "concept_folder.renamed" : "concept_folder.created",
    entityType: "concept_folder",
    entityId: input.folderId,
    summary: en.activity.folderSaved(input.name),
  });
  revalidatePath(listPath(input.projectId));
});

// Concepts in a deleted folder move to the top level.
export const deleteConceptFolder = defineAction(folderIdSchema, async ({ projectId, folderId }) => {
  const { supabase } = await requireProjectRole(projectId, "editor");
  const { data, error } = await supabase
    .from("concept_folders")
    .delete()
    .eq("id", folderId)
    .eq("project_id", projectId)
    .select("id, name")
    .maybeSingle();
  if (error || !data) throw new ActionError(en.concepts.errors.deleteFailed);

  await logActivity(supabase, {
    projectId,
    action: "concept_folder.deleted",
    entityType: "concept_folder",
    entityId: folderId,
    summary: en.activity.folderDeleted(data.name),
  });
  revalidatePath(listPath(projectId));
});

export const saveBeat = defineAction(saveBeatSchema, async (input) => {
  const { supabase, user } = await requireProjectRole(input.projectId, "editor");
  const values = {
    title: input.title,
    description: input.description,
    start_sec: input.startSec,
    end_sec: input.endSec,
  };
  if (input.beatId) {
    const { data, error } = await supabase
      .from("concept_beats")
      .update(values)
      .eq("id", input.beatId)
      .eq("concept_id", input.conceptId)
      .eq("project_id", input.projectId)
      .select("id")
      .maybeSingle();
    if (error || !data) throw new ActionError(en.concepts.errors.saveFailed);
  } else {
    // The concept must belong to this project; the trigger then copies its
    // project_id onto the beat.
    const { data: concept } = await supabase
      .from("concepts")
      .select("id")
      .eq("id", input.conceptId)
      .eq("project_id", input.projectId)
      .maybeSingle();
    if (!concept) throw new ActionError(en.errors.notFound);
    const { data: beats } = await supabase
      .from("concept_beats")
      .select("position")
      .eq("concept_id", input.conceptId);
    const { error } = await supabase.from("concept_beats").insert({
      ...values,
      project_id: input.projectId,
      concept_id: input.conceptId,
      position: positionAfter(lastPosition(beats)),
      created_by: user.id,
    });
    if (error) throw new ActionError(en.concepts.errors.saveFailed);
  }

  await logActivity(supabase, {
    projectId: input.projectId,
    action: input.beatId ? "beat.updated" : "beat.created",
    entityType: "concept_beat",
    entityId: input.beatId,
    summary: en.activity.beatSaved(input.title),
  });
  revalidatePath(conceptPath(input.projectId, input.conceptId));
});

export const deleteBeat = defineAction(beatIdSchema, async ({ projectId, conceptId, beatId }) => {
  const { supabase } = await requireProjectRole(projectId, "editor");
  const { data, error } = await supabase
    .from("concept_beats")
    .delete()
    .eq("id", beatId)
    .eq("project_id", projectId)
    .select("id, title")
    .maybeSingle();
  if (error || !data) throw new ActionError(en.concepts.errors.deleteFailed);

  await logActivity(supabase, {
    projectId,
    action: "beat.deleted",
    entityType: "concept_beat",
    entityId: beatId,
    summary: en.activity.beatDeleted(data.title),
  });
  revalidatePath(conceptPath(projectId, conceptId));
});

export const addBeatItem = defineAction(addBeatItemSchema, async (input) => {
  const { supabase, user } = await requireProjectRole(input.projectId, "editor");
  const { data: beat } = await supabase
    .from("concept_beats")
    .select("id")
    .eq("id", input.beatId)
    .eq("project_id", input.projectId)
    .maybeSingle();
  if (!beat) throw new ActionError(en.errors.notFound);
  const { data: items } = await supabase
    .from("beat_items")
    .select("position")
    .eq("beat_id", input.beatId);
  const { error } = await supabase.from("beat_items").insert({
    project_id: input.projectId,
    beat_id: input.beatId,
    label: input.label,
    position: positionAfter(lastPosition(items)),
    created_by: user.id,
  });
  if (error) throw new ActionError(en.concepts.errors.saveFailed);

  await logActivity(supabase, {
    projectId: input.projectId,
    action: "beat_item.created",
    entityType: "beat_item",
    summary: en.activity.beatItemAdded(input.label),
  });
  revalidatePath(conceptPath(input.projectId, input.conceptId));
});

export const toggleBeatItem = defineAction(toggleBeatItemSchema, async (input) => {
  const { supabase } = await requireProjectRole(input.projectId, "editor");
  const { data, error } = await supabase
    .from("beat_items")
    .update({ done: input.done })
    .eq("id", input.itemId)
    .eq("project_id", input.projectId)
    .select("id, label")
    .maybeSingle();
  if (error || !data) throw new ActionError(en.concepts.errors.saveFailed);

  await logActivity(supabase, {
    projectId: input.projectId,
    action: input.done ? "beat_item.done" : "beat_item.reopened",
    entityType: "beat_item",
    entityId: input.itemId,
    summary: input.done
      ? en.activity.beatItemDone(data.label)
      : en.activity.beatItemReopened(data.label),
  });
  revalidatePath(conceptPath(input.projectId, input.conceptId));
});

export const deleteBeatItem = defineAction(beatItemIdSchema, async (input) => {
  const { supabase } = await requireProjectRole(input.projectId, "editor");
  const { data, error } = await supabase
    .from("beat_items")
    .delete()
    .eq("id", input.itemId)
    .eq("project_id", input.projectId)
    .select("id, label")
    .maybeSingle();
  if (error || !data) throw new ActionError(en.concepts.errors.deleteFailed);

  await logActivity(supabase, {
    projectId: input.projectId,
    action: "beat_item.deleted",
    entityType: "beat_item",
    entityId: input.itemId,
    summary: en.activity.beatItemDeleted(data.label),
  });
  revalidatePath(conceptPath(input.projectId, input.conceptId));
});
