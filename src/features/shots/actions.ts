"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { ActionError, defineAction } from "@/lib/action";
import { logActivity } from "@/lib/activity";
import type { TablesUpdate } from "@/lib/db.types";
import { requireProjectRole } from "@/lib/permissions/guards";
import { comparePositions, positionAfter, positionBetween } from "@/lib/position";
import { BUILTIN_KEYS } from "@/lib/shots/columns";
import { en } from "@/messages/en";

import {
  addCastSchema,
  addFrameSchema,
  beatsToSegmentsSchema,
  columnIdSchema,
  createSegmentSchema,
  createShotSchema,
  creativeIdSchema,
  frameIdSchema,
  moveSegmentSchema,
  moveShotsSchema,
  removeCastSchema,
  saveColumnSchema,
  saveCreativeSchema,
  segmentIdSchema,
  setActiveFrameSchema,
  setColumnVisibleSchema,
  shotIdsSchema,
  updateSegmentSchema,
  updateShotSchema,
} from "./schema";

const UNIQUE_VIOLATION = "23505";
const shotlistPath = (projectId: string) => `/projects/${projectId}/shotlist`;

function lastPosition(rows: { position: string }[] | null): string | null {
  return (rows ?? []).map((row) => row.position).sort(comparePositions).at(-1) ?? null;
}

// --- Shots. The list keeps its own cache, so these do not revalidate. ---

export const createShot = defineAction(createShotSchema, async (input) => {
  const { supabase, user } = await requireProjectRole(input.projectId, "editor");
  // project_id and creative_id are set from the segment by triggers; the
  // segment itself must belong to this project.
  const { data: segment } = await supabase
    .from("segments")
    .select("id, creative_id")
    .eq("id", input.segmentId)
    .eq("project_id", input.projectId)
    .maybeSingle();
  if (!segment) throw new ActionError(en.errors.notFound);

  const { error } = await supabase.from("shots").insert({
    id: input.shotId,
    project_id: input.projectId,
    creative_id: segment.creative_id,
    segment_id: input.segmentId,
    position: input.position,
    created_by: user.id,
  });
  if (error) throw new ActionError(en.shots.errors.saveFailed);

  await logActivity(supabase, {
    projectId: input.projectId,
    action: "shot.created",
    entityType: "shot",
    entityId: input.shotId,
    summary: en.activity.shotCreated,
  });
});

export const updateShot = defineAction(updateShotSchema, async (input) => {
  const { supabase } = await requireProjectRole(input.projectId, "editor");
  const { custom_values: customValues, status, ...fields } = input.patch;
  // A cleared status falls back to the default; every other field may be empty.
  let update: TablesUpdate<"shots"> = {
    ...fields,
    ...(status === undefined ? {} : { status: status ?? "planned" }),
  };

  if (customValues) {
    // Custom values are merged, so a change to one column keeps the others.
    const { data: current } = await supabase
      .from("shots")
      .select("custom_values")
      .eq("id", input.shotId)
      .eq("project_id", input.projectId)
      .maybeSingle();
    if (!current) throw new ActionError(en.errors.notFound);
    const existing = (current.custom_values ?? {}) as Record<string, string | number | boolean | null>;
    update = { ...update, custom_values: { ...existing, ...customValues } };
  }

  const { data, error } = await supabase
    .from("shots")
    .update(update)
    .eq("id", input.shotId)
    .eq("project_id", input.projectId)
    .select("id")
    .maybeSingle();
  if (error || !data) throw new ActionError(en.shots.errors.saveFailed);

  if (input.logEdit) {
    await logActivity(supabase, {
      projectId: input.projectId,
      action: "shot.updated",
      entityType: "shot",
      entityId: input.shotId,
      summary: en.activity.shotEdited,
    });
  }
});

// Moves shots to a segment and position. A drag sends one move, so a reorder
// writes exactly one row.
export const moveShots = defineAction(moveShotsSchema, async ({ projectId, moves }) => {
  const { supabase } = await requireProjectRole(projectId, "editor");
  for (const move of moves) {
    const { data, error } = await supabase
      .from("shots")
      .update({ segment_id: move.segmentId, position: move.position })
      .eq("id", move.shotId)
      .eq("project_id", projectId)
      .select("id")
      .maybeSingle();
    if (error || !data) throw new ActionError(en.shots.errors.moveFailed);
  }

  await logActivity(supabase, {
    projectId,
    action: "shot.moved",
    entityType: "shot",
    entityId: moves.length === 1 ? moves[0].shotId : null,
    summary: en.activity.shotsMoved(moves.length),
  });
});

// Copies shots, each placed right after its original, without frames.
export const duplicateShots = defineAction(shotIdsSchema, async ({ projectId, shotIds }) => {
  const { supabase, user } = await requireProjectRole(projectId, "editor");
  const { data: originals } = await supabase
    .from("shots")
    .select("*, cast:shot_talents(talent_id)")
    .eq("project_id", projectId)
    .in("id", shotIds);
  if (!originals || originals.length === 0) throw new ActionError(en.errors.notFound);

  const segmentIds = [...new Set(originals.map((shot) => shot.segment_id))];
  const { data: siblings } = await supabase
    .from("shots")
    .select("id, segment_id, position")
    .eq("project_id", projectId)
    .in("segment_id", segmentIds);
  const positions = new Map<string, string[]>();
  for (const row of siblings ?? []) {
    positions.set(row.segment_id, [...(positions.get(row.segment_id) ?? []), row.position]);
  }
  for (const list of positions.values()) list.sort(comparePositions);

  const copies = [];
  const cast = [];
  for (const original of originals.sort((a, b) => comparePositions(a.position, b.position))) {
    const list = positions.get(original.segment_id) ?? [];
    const index = list.indexOf(original.position);
    const position = positionBetween(original.position, list[index + 1] ?? null);
    list.splice(index + 1, 0, position);
    const id = randomUUID();
    // A copy starts without frames and with fresh timestamps. The keys have
    // to be absent: a bulk insert would send an undefined value as null.
    const fields: Partial<typeof original> = { ...original };
    delete fields.cast;
    delete fields.created_at;
    delete fields.updated_at;
    delete fields.active_frame_id;
    const { cast: links } = original;
    copies.push({
      ...(fields as Omit<typeof original, "cast" | "created_at" | "updated_at" | "active_frame_id">),
      id,
      position,
      created_by: user.id,
    });
    cast.push(...links.map((link) => ({ project_id: projectId, shot_id: id, talent_id: link.talent_id })));
  }

  const { error } = await supabase.from("shots").insert(copies);
  if (error) throw new ActionError(en.shots.errors.saveFailed);
  if (cast.length > 0) {
    const { error: castError } = await supabase.from("shot_talents").insert(cast);
    if (castError) throw new ActionError(en.shots.errors.saveFailed);
  }

  await logActivity(supabase, {
    projectId,
    action: "shot.duplicated",
    entityType: "shot",
    summary: en.activity.shotsDuplicated(copies.length),
  });
});

export const deleteShots = defineAction(shotIdsSchema, async ({ projectId, shotIds }) => {
  const { supabase } = await requireProjectRole(projectId, "editor");
  const { data, error } = await supabase
    .from("shots")
    .delete()
    .eq("project_id", projectId)
    .in("id", shotIds)
    .select("id");
  if (error || !data || data.length === 0) throw new ActionError(en.shots.errors.deleteFailed);

  await logActivity(supabase, {
    projectId,
    action: "shot.deleted",
    entityType: "shot",
    summary: en.activity.shotsDeleted(data.length),
  });
});

// Adds a talent to a shot by name. An unknown name creates the library entry
// on the spot.
export const addCast = defineAction(addCastSchema, async ({ projectId, shotId, name }) => {
  const { supabase, user } = await requireProjectRole(projectId, "editor");
  const { data: shot } = await supabase
    .from("shots")
    .select("id")
    .eq("id", shotId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (!shot) throw new ActionError(en.errors.notFound);

  const { data: matches } = await supabase
    .from("talents")
    .select("id, name, type")
    .ilike("name", name.replace(/[\\%_]/g, (char) => `\\${char}`))
    .limit(1);
  let talent = matches?.[0];
  if (!talent) {
    const { data: created, error } = await supabase
      .from("talents")
      .insert({ name, created_by: user.id })
      .select("id, name, type")
      .single();
    if (error) throw new ActionError(en.shots.errors.castFailed);
    talent = created;
    await logActivity(supabase, {
      projectId: null,
      action: "talent.created",
      entityType: "talent",
      entityId: talent.id,
      summary: en.activity.talentCreated(talent.name),
    });
  }

  const { error } = await supabase
    .from("shot_talents")
    .insert({ project_id: projectId, shot_id: shotId, talent_id: talent.id, created_by: user.id });
  if (error && error.code !== UNIQUE_VIOLATION) throw new ActionError(en.shots.errors.castFailed);

  await logActivity(supabase, {
    projectId,
    action: "shot.cast_added",
    entityType: "shot",
    entityId: shotId,
    summary: en.activity.castAdded(talent.name),
  });
  return talent;
});

export const removeCast = defineAction(removeCastSchema, async ({ projectId, shotId, talentId }) => {
  const { supabase } = await requireProjectRole(projectId, "editor");
  const { error } = await supabase
    .from("shot_talents")
    .delete()
    .eq("project_id", projectId)
    .eq("shot_id", shotId)
    .eq("talent_id", talentId);
  if (error) throw new ActionError(en.shots.errors.castFailed);

  await logActivity(supabase, {
    projectId,
    action: "shot.cast_removed",
    entityType: "shot",
    entityId: shotId,
    summary: en.activity.castRemoved,
  });
});

// --- Segments. ---

export const createSegment = defineAction(createSegmentSchema, async (input) => {
  const { supabase, user } = await requireProjectRole(input.projectId, "editor");
  const { data: creative } = await supabase
    .from("creatives")
    .select("id")
    .eq("id", input.creativeId)
    .eq("project_id", input.projectId)
    .maybeSingle();
  if (!creative) throw new ActionError(en.errors.notFound);

  const { error } = await supabase.from("segments").insert({
    id: input.segmentId,
    project_id: input.projectId,
    creative_id: input.creativeId,
    title: input.title,
    position: input.position,
    created_by: user.id,
  });
  if (error) throw new ActionError(en.shots.errors.saveFailed);

  await logActivity(supabase, {
    projectId: input.projectId,
    action: "segment.created",
    entityType: "segment",
    entityId: input.segmentId,
    summary: en.activity.segmentCreated(input.title),
  });
});

export const updateSegment = defineAction(updateSegmentSchema, async (input) => {
  const { supabase } = await requireProjectRole(input.projectId, "editor");
  const { data, error } = await supabase
    .from("segments")
    .update({ title: input.title, target_duration_sec: input.targetDurationSec })
    .eq("id", input.segmentId)
    .eq("project_id", input.projectId)
    .select("id")
    .maybeSingle();
  if (error || !data) throw new ActionError(en.shots.errors.saveFailed);

  await logActivity(supabase, {
    projectId: input.projectId,
    action: "segment.updated",
    entityType: "segment",
    entityId: input.segmentId,
    summary: en.activity.segmentUpdated(input.title),
  });
});

export const moveSegment = defineAction(moveSegmentSchema, async (input) => {
  const { supabase } = await requireProjectRole(input.projectId, "editor");
  const { data, error } = await supabase
    .from("segments")
    .update({ position: input.position })
    .eq("id", input.segmentId)
    .eq("project_id", input.projectId)
    .select("id, title")
    .maybeSingle();
  if (error || !data) throw new ActionError(en.shots.errors.moveFailed);

  await logActivity(supabase, {
    projectId: input.projectId,
    action: "segment.moved",
    entityType: "segment",
    entityId: input.segmentId,
    summary: en.activity.segmentMoved(data.title),
  });
});

// Deletes a segment with its shots. A creative keeps at least one segment.
export const deleteSegment = defineAction(segmentIdSchema, async ({ projectId, segmentId }) => {
  const { supabase } = await requireProjectRole(projectId, "editor");
  const { data: segment } = await supabase
    .from("segments")
    .select("id, title, creative_id")
    .eq("id", segmentId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (!segment) throw new ActionError(en.errors.notFound);
  const { count } = await supabase
    .from("segments")
    .select("id", { count: "exact", head: true })
    .eq("creative_id", segment.creative_id);
  if ((count ?? 0) <= 1) throw new ActionError(en.shots.errors.lastSegment);

  const { error } = await supabase.from("segments").delete().eq("id", segmentId);
  if (error) throw new ActionError(en.shots.errors.deleteFailed);

  await logActivity(supabase, {
    projectId,
    action: "segment.deleted",
    entityType: "segment",
    entityId: segmentId,
    summary: en.activity.segmentDeleted(segment.title),
  });
});

// --- Creatives. ---

export const saveCreative = defineAction(saveCreativeSchema, async (input) => {
  const { supabase, user } = await requireProjectRole(input.projectId, "editor");
  const values = {
    title: input.title,
    status: input.status,
    goal: input.goal,
    key_message: input.keyMessage,
    audience: input.audience,
    must_haves: input.mustHaves,
    no_gos: input.noGos,
    aspect_ratio: input.aspectRatio,
  };
  let creativeId = input.creativeId;

  if (creativeId) {
    const { data, error } = await supabase
      .from("creatives")
      .update(values)
      .eq("id", creativeId)
      .eq("project_id", input.projectId)
      .select("id")
      .maybeSingle();
    if (error || !data) throw new ActionError(en.shots.errors.saveFailed);
  } else {
    const { data: siblings } = await supabase
      .from("creatives")
      .select("position")
      .eq("project_id", input.projectId);
    creativeId = randomUUID();
    const { error } = await supabase.from("creatives").insert({
      ...values,
      id: creativeId,
      project_id: input.projectId,
      position: positionAfter(lastPosition(siblings)),
      created_by: user.id,
    });
    if (error) throw new ActionError(en.shots.errors.saveFailed);
    // Every creative starts with one segment to put shots in.
    const { error: segmentError } = await supabase.from("segments").insert({
      project_id: input.projectId,
      creative_id: creativeId,
      title: en.shots.firstSegment,
      position: positionAfter(null),
      created_by: user.id,
    });
    if (segmentError) throw new ActionError(en.shots.errors.saveFailed);
  }

  await logActivity(supabase, {
    projectId: input.projectId,
    action: input.creativeId ? "creative.updated" : "creative.created",
    entityType: "creative",
    entityId: creativeId,
    summary: input.creativeId
      ? en.activity.creativeUpdated(input.title)
      : en.activity.creativeCreated(input.title),
  });
  revalidatePath(shotlistPath(input.projectId));
  if (!input.creativeId) redirect(`${shotlistPath(input.projectId)}?creative=${creativeId}`);
});

// A project keeps at least one creative.
export const deleteCreative = defineAction(creativeIdSchema, async ({ projectId, creativeId }) => {
  const { supabase } = await requireProjectRole(projectId, "editor");
  const { count } = await supabase
    .from("creatives")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId);
  if ((count ?? 0) <= 1) throw new ActionError(en.shots.errors.lastCreative);

  const { data, error } = await supabase
    .from("creatives")
    .delete()
    .eq("id", creativeId)
    .eq("project_id", projectId)
    .select("id, title")
    .maybeSingle();
  if (error || !data) throw new ActionError(en.shots.errors.deleteFailed);

  await logActivity(supabase, {
    projectId,
    action: "creative.deleted",
    entityType: "creative",
    entityId: creativeId,
    summary: en.activity.creativeDeleted(data.title),
  });
  revalidatePath(shotlistPath(projectId));
  redirect(shotlistPath(projectId));
});

// --- Columns. ---

function columnKey(label: string): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 30);
  return /^[a-z]/.test(slug) ? slug : `c_${slug}`.replace(/_$/, "");
}

export const saveCustomColumn = defineAction(saveColumnSchema, async (input) => {
  const { supabase, user } = await requireProjectRole(input.projectId, "editor");
  const config = { options: input.type === "select" ? input.options : [] };

  if (input.columnId) {
    // The key and type stay: the stored values depend on them.
    const { data, error } = await supabase
      .from("shotlist_columns")
      .update({ label: input.label, config })
      .eq("id", input.columnId)
      .eq("project_id", input.projectId)
      .neq("type", "builtin")
      .select("id")
      .maybeSingle();
    if (error || !data) throw new ActionError(en.shots.errors.columnFailed);
  } else {
    const { data: existing } = await supabase
      .from("shotlist_columns")
      .select("key, position, type")
      .eq("project_id", input.projectId);
    const taken = new Set([...(existing ?? []).map((row) => row.key), ...BUILTIN_KEYS]);
    const base = columnKey(input.label);
    let key = base;
    for (let suffix = 2; taken.has(key); suffix += 1) key = `${base}_${suffix}`;
    const { error } = await supabase.from("shotlist_columns").insert({
      project_id: input.projectId,
      key,
      label: input.label,
      type: input.type,
      config,
      position: positionAfter(
        lastPosition((existing ?? []).filter((row) => row.type !== "builtin")),
      ),
      created_by: user.id,
    });
    if (error) throw new ActionError(en.shots.errors.columnFailed);
  }

  await logActivity(supabase, {
    projectId: input.projectId,
    action: input.columnId ? "shotlist_column.updated" : "shotlist_column.created",
    entityType: "shotlist_column",
    entityId: input.columnId,
    summary: en.activity.columnSaved(input.label),
  });
  revalidatePath(shotlistPath(input.projectId));
});

export const deleteCustomColumn = defineAction(columnIdSchema, async ({ projectId, columnId }) => {
  const { supabase } = await requireProjectRole(projectId, "editor");
  const { data, error } = await supabase
    .from("shotlist_columns")
    .delete()
    .eq("id", columnId)
    .eq("project_id", projectId)
    .neq("type", "builtin")
    .select("id, label")
    .maybeSingle();
  if (error || !data) throw new ActionError(en.shots.errors.columnFailed);

  await logActivity(supabase, {
    projectId,
    action: "shotlist_column.deleted",
    entityType: "shotlist_column",
    entityId: columnId,
    summary: en.activity.columnDeleted(data.label),
  });
  revalidatePath(shotlistPath(projectId));
});

// Shows or hides a column for everyone in the project.
export const setColumnVisible = defineAction(setColumnVisibleSchema, async (input) => {
  const { supabase, user } = await requireProjectRole(input.projectId, "editor");
  if (BUILTIN_KEYS.has(input.key)) {
    const { error } = await supabase.from("shotlist_columns").upsert(
      {
        project_id: input.projectId,
        key: input.key,
        label: input.key,
        type: "builtin",
        position: "V",
        visible: input.visible,
        created_by: user.id,
      },
      { onConflict: "project_id,key" },
    );
    if (error) throw new ActionError(en.shots.errors.columnFailed);
  } else {
    const { data, error } = await supabase
      .from("shotlist_columns")
      .update({ visible: input.visible })
      .eq("project_id", input.projectId)
      .eq("key", input.key)
      .select("id")
      .maybeSingle();
    if (error || !data) throw new ActionError(en.shots.errors.columnFailed);
  }

  await logActivity(supabase, {
    projectId: input.projectId,
    action: "shotlist_column.visibility",
    entityType: "shotlist_column",
    summary: en.activity.columnVisibility,
  });
  revalidatePath(shotlistPath(input.projectId));
});

// --- Frames. ---

// Adds a frame version from an uploaded or library file and makes it the
// active one.
export const addFrame = defineAction(addFrameSchema, async (input) => {
  const { supabase, user } = await requireProjectRole(input.projectId, "editor");
  const { data: frame, error } = await supabase
    .from("shot_frames")
    .insert({
      project_id: input.projectId,
      shot_id: input.shotId,
      file_id: input.fileId,
      source: input.source,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error) throw new ActionError(en.shots.errors.frameFailed);

  const { error: activeError } = await supabase
    .from("shots")
    .update({ active_frame_id: frame.id })
    .eq("id", input.shotId)
    .eq("project_id", input.projectId);
  if (activeError) throw new ActionError(en.shots.errors.frameFailed);

  await logActivity(supabase, {
    projectId: input.projectId,
    action: "shot_frame.created",
    entityType: "shot",
    entityId: input.shotId,
    summary: en.activity.frameAdded,
  });
});

export const setActiveFrame = defineAction(setActiveFrameSchema, async (input) => {
  const { supabase } = await requireProjectRole(input.projectId, "editor");
  const { data, error } = await supabase
    .from("shots")
    .update({ active_frame_id: input.frameId })
    .eq("id", input.shotId)
    .eq("project_id", input.projectId)
    .select("id")
    .maybeSingle();
  if (error || !data) throw new ActionError(en.shots.errors.frameFailed);

  await logActivity(supabase, {
    projectId: input.projectId,
    action: "shot_frame.activated",
    entityType: "shot",
    entityId: input.shotId,
    summary: en.activity.frameActivated,
  });
});

// Removes a frame version. The image stays in the file library.
export const deleteFrame = defineAction(frameIdSchema, async ({ projectId, frameId }) => {
  const { supabase } = await requireProjectRole(projectId, "editor");
  const { data, error } = await supabase
    .from("shot_frames")
    .delete()
    .eq("id", frameId)
    .eq("project_id", projectId)
    .select("id, shot_id")
    .maybeSingle();
  if (error || !data) throw new ActionError(en.shots.errors.frameFailed);

  await logActivity(supabase, {
    projectId,
    action: "shot_frame.deleted",
    entityType: "shot",
    entityId: data.shot_id,
    summary: en.activity.frameDeleted,
  });
});

// --- Concept to shot list. ---

// Creates one segment per beat of a concept in the project's first creative,
// with the beat lengths as target times.
export const beatsToSegments = defineAction(beatsToSegmentsSchema, async (input) => {
  const { supabase, user } = await requireProjectRole(input.projectId, "editor");
  const [{ data: beats }, { data: creatives }] = await Promise.all([
    supabase
      .from("concept_beats")
      .select("title, description, start_sec, end_sec")
      .eq("concept_id", input.conceptId)
      .eq("project_id", input.projectId)
      .order("start_sec"),
    supabase.from("creatives").select("id, position").eq("project_id", input.projectId),
  ]);
  const creative = (creatives ?? []).sort((a, b) => comparePositions(a.position, b.position))[0];
  if (!beats || beats.length === 0) throw new ActionError(en.shots.errors.noBeats);
  if (!creative) throw new ActionError(en.errors.notFound);

  const { data: existing } = await supabase
    .from("segments")
    .select("position")
    .eq("creative_id", creative.id);
  let last = lastPosition(existing);
  const rows = beats.map((beat) => {
    last = positionAfter(last);
    return {
      project_id: input.projectId,
      creative_id: creative.id,
      title: beat.title,
      description: beat.description,
      target_duration_sec: beat.end_sec - beat.start_sec,
      position: last,
      created_by: user.id,
    };
  });
  const { error } = await supabase.from("segments").insert(rows);
  if (error) throw new ActionError(en.shots.errors.saveFailed);

  await logActivity(supabase, {
    projectId: input.projectId,
    action: "segment.created_from_beats",
    entityType: "creative",
    entityId: creative.id,
    summary: en.activity.segmentsFromBeats(rows.length),
  });
  revalidatePath(shotlistPath(input.projectId));
  redirect(`${shotlistPath(input.projectId)}?creative=${creative.id}`);
});
