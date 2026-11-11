"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { ActionError, defineAction } from "@/lib/action";
import { logActivity } from "@/lib/activity";
import type { Json } from "@/lib/db.types";
import { requireProjectRole } from "@/lib/permissions/guards";
import { en } from "@/messages/en";

import { boardIdSchema, createBoardSchema, renameBoardSchema, saveBoardSchema } from "./schema";

const boardPath = (projectId: string) => `/projects/${projectId}/moodboard`;

// Writes one batch of canvas changes. Does not revalidate: the canvas already
// shows what it sent.
export const saveBoardChanges = defineAction(saveBoardSchema, async (input) => {
  const { supabase, user } = await requireProjectRole(input.projectId, "editor");
  const { data: board } = await supabase
    .from("moodboards")
    .select("id, title")
    .eq("id", input.boardId)
    .eq("project_id", input.projectId)
    .maybeSingle();
  if (!board) throw new ActionError(en.errors.notFound);

  // Edges first on the way out, nodes first on the way in, so no edge ever
  // points at a missing node.
  if (input.removedEdgeIds.length > 0) {
    const { error } = await supabase
      .from("moodboard_edges")
      .delete()
      .eq("board_id", input.boardId)
      .in("id", input.removedEdgeIds);
    if (error) throw new ActionError(en.moodboard.errors.saveFailed);
  }
  if (input.removedNodeIds.length > 0) {
    const { error } = await supabase
      .from("moodboard_nodes")
      .delete()
      .eq("board_id", input.boardId)
      .in("id", input.removedNodeIds);
    if (error) throw new ActionError(en.moodboard.errors.saveFailed);
  }
  if (input.nodes.length > 0) {
    const { error } = await supabase.from("moodboard_nodes").upsert(
      input.nodes.map((node) => ({
        id: node.id,
        project_id: input.projectId,
        board_id: input.boardId,
        type: node.type,
        x: node.x,
        y: node.y,
        width: node.width,
        height: node.height,
        z: node.z,
        data: node.data as NonNullable<Json>,
        file_id: node.fileId,
        created_by: user.id,
      })),
    );
    if (error) throw new ActionError(en.moodboard.errors.saveFailed);
  }
  if (input.edges.length > 0) {
    const { error } = await supabase.from("moodboard_edges").upsert(
      input.edges.map((edge) => ({
        id: edge.id,
        project_id: input.projectId,
        board_id: input.boardId,
        source_node_id: edge.sourceNodeId,
        target_node_id: edge.targetNodeId,
        style: edge.style as NonNullable<Json>,
        created_by: user.id,
      })),
    );
    if (error) throw new ActionError(en.moodboard.errors.saveFailed);
  }

  if (input.logEdit) {
    await logActivity(supabase, {
      projectId: input.projectId,
      action: "moodboard.edited",
      entityType: "moodboard",
      entityId: input.boardId,
      summary: en.activity.boardEdited(board.title),
    });
  }
});

export const createBoard = defineAction(createBoardSchema, async ({ projectId, title, creativeId }) => {
  const { supabase, user } = await requireProjectRole(projectId, "editor");
  const { data, error } = await supabase
    .from("moodboards")
    .insert({ project_id: projectId, title, creative_id: creativeId, created_by: user.id })
    .select("id")
    .single();
  if (error) throw new ActionError(en.moodboard.errors.saveFailed);

  await logActivity(supabase, {
    projectId,
    action: "moodboard.created",
    entityType: "moodboard",
    entityId: data.id,
    summary: en.activity.boardCreated(title),
  });
  revalidatePath(boardPath(projectId));
  redirect(`${boardPath(projectId)}?board=${data.id}`);
});

export const renameBoard = defineAction(renameBoardSchema, async ({ projectId, boardId, title }) => {
  const { supabase } = await requireProjectRole(projectId, "editor");
  const { data, error } = await supabase
    .from("moodboards")
    .update({ title })
    .eq("id", boardId)
    .eq("project_id", projectId)
    .select("id")
    .maybeSingle();
  if (error || !data) throw new ActionError(en.moodboard.errors.saveFailed);

  await logActivity(supabase, {
    projectId,
    action: "moodboard.renamed",
    entityType: "moodboard",
    entityId: boardId,
    summary: en.activity.boardRenamed(title),
  });
  revalidatePath(boardPath(projectId));
});

// A project always keeps at least one board.
export const deleteBoard = defineAction(boardIdSchema, async ({ projectId, boardId }) => {
  const { supabase } = await requireProjectRole(projectId, "editor");
  const { count } = await supabase
    .from("moodboards")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId);
  if ((count ?? 0) <= 1) throw new ActionError(en.moodboard.errors.lastBoard);

  const { data, error } = await supabase
    .from("moodboards")
    .delete()
    .eq("id", boardId)
    .eq("project_id", projectId)
    .select("id, title")
    .maybeSingle();
  if (error || !data) throw new ActionError(en.moodboard.errors.deleteFailed);

  await logActivity(supabase, {
    projectId,
    action: "moodboard.deleted",
    entityType: "moodboard",
    entityId: boardId,
    summary: en.activity.boardDeleted(data.title),
  });
  revalidatePath(boardPath(projectId));
  redirect(boardPath(projectId));
});
