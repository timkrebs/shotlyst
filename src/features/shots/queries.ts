import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/db.types";
import { comparePositions } from "@/lib/position";
import type { ColumnSetting } from "@/lib/shots/columns";
import type { CustomValue, Segment, Shot, ShotList } from "@/lib/shots/types";

// These queries run on the server for the first render and in the browser
// when the shot list reloads its cache, so they take either client. Row
// Level Security decides what comes back in both cases.
type Client = SupabaseClient<Database>;

export async function listCreatives(supabase: Client, projectId: string) {
  const { data, error } = await supabase
    .from("creatives")
    .select("id, title, status, goal, key_message, audience, aspect_ratio, must_haves, no_gos, position")
    .eq("project_id", projectId);
  if (error) throw new Error(error.message);
  return data.sort((a, b) => comparePositions(a.position, b.position));
}

// Segments and shots of one creative, in running order.
export async function loadShotList(supabase: Client, creativeId: string): Promise<ShotList> {
  const [segments, shots] = await Promise.all([
    supabase
      .from("segments")
      .select("id, title, description, target_duration_sec, position")
      .eq("creative_id", creativeId),
    supabase
      .from("shots")
      .select(
        `id, segment_id, position, shot_number, action, audio, on_screen_text, shot_size,
         camera_movement, camera_angle, lens, frame_rate, equipment_note, int_ext, day_night,
         duration_sec, setup_min, status, notes, custom_values, active_frame_id,
         cast:shot_talents(talent_id),
         active_frame:shot_frames!shots_active_frame_id_fkey(file:files(path))`,
      )
      .eq("creative_id", creativeId),
  ]);
  if (segments.error) throw new Error(segments.error.message);
  if (shots.error) throw new Error(shots.error.message);

  const orderedSegments: Segment[] = segments.data.sort((a, b) =>
    comparePositions(a.position, b.position),
  );
  const orderedShots: Shot[] = shots.data
    .sort((a, b) => comparePositions(a.position, b.position))
    .map(({ cast, active_frame, custom_values, ...shot }) => ({
      ...shot,
      custom_values: (custom_values ?? {}) as Record<string, CustomValue>,
      talent_ids: cast.map((link) => link.talent_id),
      frame_path: active_frame?.file?.path ?? null,
    }));
  return { segments: orderedSegments, shots: orderedShots };
}

export async function listColumnSettings(supabase: Client, projectId: string): Promise<ColumnSetting[]> {
  const { data, error } = await supabase
    .from("shotlist_columns")
    .select("id, key, label, type, config, position, visible")
    .eq("project_id", projectId);
  if (error) throw new Error(error.message);
  return data;
}

// The talent library, for the cast picker and for cast names in exports.
export async function listTalentNames(supabase: Client) {
  const { data, error } = await supabase.from("talents").select("id, name, type").order("name");
  if (error) throw new Error(error.message);
  return data;
}

export async function listShotFrames(supabase: Client, shotId: string) {
  const { data, error } = await supabase
    .from("shot_frames")
    .select("id, source, created_at, file:files(id, path, name)")
    .eq("shot_id", shotId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data;
}

export type Creative = Awaited<ReturnType<typeof listCreatives>>[number];
export type TalentName = Awaited<ReturnType<typeof listTalentNames>>[number];
export type ShotFrame = Awaited<ReturnType<typeof listShotFrames>>[number];
