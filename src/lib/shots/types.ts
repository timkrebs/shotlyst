import type { Tables } from "@/lib/db.types";

// The shot fields a member edits in the list.
export const SHOT_TEXT_FIELDS = [
  "action",
  "audio",
  "on_screen_text",
  "shot_size",
  "camera_movement",
  "camera_angle",
  "lens",
  "frame_rate",
  "equipment_note",
  "int_ext",
  "day_night",
  "status",
  "notes",
] as const;
export const SHOT_NUMBER_FIELDS = ["duration_sec", "setup_min"] as const;

export type ShotTextField = (typeof SHOT_TEXT_FIELDS)[number];
export type ShotNumberField = (typeof SHOT_NUMBER_FIELDS)[number];
export type CustomValue = string | number | boolean | null;

type ShotRow = Tables<"shots">;

// One shot as the views use it: the stored fields plus cast and active frame.
export interface Shot
  extends Pick<ShotRow, "id" | "segment_id" | "position" | "shot_number" | ShotTextField | ShotNumberField> {
  custom_values: Record<string, CustomValue>;
  talent_ids: string[];
  active_frame_id: string | null;
  // Storage path of the active frame's image.
  frame_path: string | null;
}

export interface Segment {
  id: string;
  title: string;
  description: string | null;
  target_duration_sec: number | null;
  position: string;
}

export interface CustomColumn {
  id: string;
  key: string;
  label: string;
  type: "text" | "number" | "select" | "checkbox";
  options: string[];
  position: string;
  visible: boolean;
}

export interface ShotList {
  segments: Segment[];
  shots: Shot[];
}
