import "server-only";

import type { ServerClient } from "@/lib/supabase/server";

import type { BoardNodeType, EdgeRow, NodeRow } from "./schema";

export async function listBoards(supabase: ServerClient, projectId: string) {
  const { data, error } = await supabase
    .from("moodboards")
    .select("id, title, creative:creatives(title)")
    .eq("project_id", projectId)
    .order("created_at");
  if (error) throw new Error(error.message);
  return data;
}

export async function getBoardContent(
  supabase: ServerClient,
  boardId: string,
): Promise<{ nodes: NodeRow[]; edges: EdgeRow[] }> {
  const [nodes, edges] = await Promise.all([
    supabase
      .from("moodboard_nodes")
      .select("id, type, x, y, width, height, z, data, file_id")
      .eq("board_id", boardId),
    supabase
      .from("moodboard_edges")
      .select("id, source_node_id, target_node_id, style")
      .eq("board_id", boardId),
  ]);
  if (nodes.error) throw new Error(nodes.error.message);
  if (edges.error) throw new Error(edges.error.message);
  return {
    nodes: nodes.data.map((node) => ({
      id: node.id,
      type: node.type as BoardNodeType,
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
      z: node.z,
      data: (node.data ?? {}) as Record<string, unknown>,
      fileId: node.file_id,
    })),
    edges: edges.data.map((edge) => ({
      id: edge.id,
      sourceNodeId: edge.source_node_id,
      targetNodeId: edge.target_node_id,
      style: (edge.style ?? {}) as Record<string, unknown>,
    })),
  };
}

// Images of the project's file library, for placing on a board.
export async function listLibraryImages(supabase: ServerClient, projectId: string) {
  const { data, error } = await supabase
    .from("files")
    .select("id, path, name, width, height")
    .eq("project_id", projectId)
    .eq("kind", "image")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data;
}

export type Board = Awaited<ReturnType<typeof listBoards>>[number];
export type LibraryImage = Awaited<ReturnType<typeof listLibraryImages>>[number];
