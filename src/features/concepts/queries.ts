import "server-only";

import { comparePositions } from "@/lib/position";
import type { ServerClient } from "@/lib/supabase/server";

export async function listConcepts(supabase: ServerClient, projectId: string) {
  const { data, error } = await supabase
    .from("concepts")
    .select("id, title, type, status, is_active, folder_id, updated_at")
    .eq("project_id", projectId)
    .order("created_at");
  if (error) throw new Error(error.message);
  return data;
}

export async function listConceptFolders(supabase: ServerClient, projectId: string) {
  const { data, error } = await supabase
    .from("concept_folders")
    .select("id, name, position")
    .eq("project_id", projectId);
  if (error) throw new Error(error.message);
  return data.sort((a, b) => comparePositions(a.position, b.position));
}

export async function getConcept(supabase: ServerClient, projectId: string, conceptId: string) {
  const { data, error } = await supabase
    .from("concepts")
    .select("id, title, type, status, is_active, folder_id, content, updated_at")
    .eq("id", conceptId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function listBeats(supabase: ServerClient, conceptId: string) {
  const { data, error } = await supabase
    .from("concept_beats")
    .select(
      "id, title, description, start_sec, end_sec, position, items:beat_items(id, label, done, position)",
    )
    .eq("concept_id", conceptId);
  if (error) throw new Error(error.message);
  return data
    .sort((a, b) => a.start_sec - b.start_sec || comparePositions(a.position, b.position))
    .map((beat) => ({
      id: beat.id,
      title: beat.title,
      description: beat.description,
      startSec: beat.start_sec,
      endSec: beat.end_sec,
      items: beat.items.sort((a, b) => comparePositions(a.position, b.position)),
    }));
}

export type ConceptListItem = Awaited<ReturnType<typeof listConcepts>>[number];
export type ConceptFolder = Awaited<ReturnType<typeof listConceptFolders>>[number];
export type Beat = Awaited<ReturnType<typeof listBeats>>[number];
