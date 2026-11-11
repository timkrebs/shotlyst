import { vocabLabel, type VocabKind } from "@/lib/film/vocab";
import { comparePositions } from "@/lib/position";
import { en } from "@/messages/en";

import type { CustomColumn, Shot, ShotNumberField, ShotTextField } from "./types";

// The columns of the shot list, defined once for the list, the PDF and the
// CSV, so an export shows what the screen shows.

export type ColumnKind = "text" | "number" | "select" | "checkbox" | "cast" | "frame";

export interface ShotColumn {
  key: string;
  label: string;
  kind: ColumnKind;
  // Built-in columns only.
  field?: ShotTextField | ShotNumberField;
  vocab?: VocabKind;
  // Custom columns only.
  custom?: boolean;
  options?: string[];
  // Relative width, for the PDF.
  weight: number;
}

interface Builtin extends ShotColumn {
  defaultVisible: boolean;
}

const labels = en.shotColumns;

export const BUILTIN_COLUMNS: Builtin[] = [
  { key: "frame", label: labels.frame, kind: "frame", weight: 2, defaultVisible: true },
  { key: "action", label: labels.action, kind: "text", field: "action", weight: 5, defaultVisible: true },
  { key: "audio", label: labels.audio, kind: "text", field: "audio", weight: 4, defaultVisible: true },
  { key: "on_screen_text", label: labels.on_screen_text, kind: "text", field: "on_screen_text", weight: 3, defaultVisible: true },
  { key: "shot_size", label: labels.shot_size, kind: "select", field: "shot_size", vocab: "shotSize", weight: 2, defaultVisible: true },
  { key: "camera_movement", label: labels.camera_movement, kind: "select", field: "camera_movement", vocab: "cameraMovement", weight: 2, defaultVisible: true },
  { key: "camera_angle", label: labels.camera_angle, kind: "select", field: "camera_angle", vocab: "cameraAngle", weight: 2, defaultVisible: true },
  { key: "lens", label: labels.lens, kind: "text", field: "lens", weight: 1.5, defaultVisible: true },
  { key: "frame_rate", label: labels.frame_rate, kind: "select", field: "frame_rate", vocab: "frameRate", weight: 1.5, defaultVisible: false },
  { key: "int_ext", label: labels.int_ext, kind: "select", field: "int_ext", vocab: "intExt", weight: 1.5, defaultVisible: true },
  { key: "day_night", label: labels.day_night, kind: "select", field: "day_night", vocab: "dayNight", weight: 1.5, defaultVisible: true },
  { key: "cast", label: labels.cast, kind: "cast", weight: 3, defaultVisible: true },
  { key: "duration_sec", label: labels.duration_sec, kind: "number", field: "duration_sec", weight: 1.5, defaultVisible: true },
  { key: "setup_min", label: labels.setup_min, kind: "number", field: "setup_min", weight: 1.5, defaultVisible: false },
  { key: "status", label: labels.status, kind: "select", field: "status", vocab: "shotStatus", weight: 1.5, defaultVisible: true },
  { key: "notes", label: labels.notes, kind: "text", field: "notes", weight: 3, defaultVisible: true },
  { key: "equipment_note", label: labels.equipment_note, kind: "text", field: "equipment_note", weight: 3, defaultVisible: false },
];

export const BUILTIN_KEYS = new Set(BUILTIN_COLUMNS.map((column) => column.key));

// Stored column settings: custom columns, and rows of type 'builtin' that
// only carry the visibility of a built-in column.
export interface ColumnSetting {
  id: string;
  key: string;
  label: string;
  type: string;
  config: unknown;
  position: string;
  visible: boolean;
}

function optionsOf(config: unknown): string[] {
  const options = (config as { options?: unknown } | null)?.options;
  return Array.isArray(options) ? options.filter((option) => typeof option === "string") : [];
}

export function customColumns(settings: ColumnSetting[]): CustomColumn[] {
  return settings
    .filter((setting) => setting.type !== "builtin")
    .sort((a, b) => comparePositions(a.position, b.position))
    .map((setting) => ({
      id: setting.id,
      key: setting.key,
      label: setting.label,
      type: setting.type as CustomColumn["type"],
      options: optionsOf(setting.config),
      position: setting.position,
      visible: setting.visible,
    }));
}

// Every column in display order with its visibility: built-in ones first,
// then the project's custom columns.
export function allColumns(settings: ColumnSetting[]): (ShotColumn & { visible: boolean })[] {
  const builtinVisibility = new Map(
    settings.filter((setting) => setting.type === "builtin").map((s) => [s.key, s.visible]),
  );
  return [
    ...BUILTIN_COLUMNS.map(({ defaultVisible, ...column }) => ({
      ...column,
      visible: builtinVisibility.get(column.key) ?? defaultVisible,
    })),
    ...customColumns(settings).map((column) => ({
      key: column.key,
      label: column.label,
      kind: column.type,
      custom: true,
      options: column.options,
      weight: column.type === "text" ? 3 : 1.5,
      visible: column.visible,
    })),
  ];
}

export function visibleColumns(settings: ColumnSetting[]): ShotColumn[] {
  return allColumns(settings).filter((column) => column.visible);
}

// The text of a cell, for CSV, PDF and read-only views. Frames have no text.
export function cellText(
  shot: Shot,
  column: ShotColumn,
  talentNames: ReadonlyMap<string, string>,
): string {
  if (column.kind === "frame") return "";
  if (column.kind === "cast") {
    return shot.talent_ids
      .map((id) => talentNames.get(id))
      .filter((name): name is string => Boolean(name))
      .join(", ");
  }
  const value = column.custom ? shot.custom_values[column.key] : column.field ? shot[column.field] : null;
  if (value === null || value === undefined || value === "") return "";
  if (column.kind === "checkbox") return value === true ? labels.yes : labels.no;
  if (column.vocab) return vocabLabel(column.vocab, String(value));
  return String(value);
}
