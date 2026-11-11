import { describe, expect, it } from "vitest";

import { visibleColumns, type ColumnSetting } from "@/lib/shots/columns";
import type { Segment, Shot } from "@/lib/shots/types";

import { shotListCsvRows, shotListExport } from "./shot-list-rows";

function shot(id: string, segmentId: string, position: string, fields: Partial<Shot> = {}): Shot {
  return {
    id,
    segment_id: segmentId,
    position,
    shot_number: null,
    action: null,
    audio: null,
    on_screen_text: null,
    shot_size: null,
    camera_movement: null,
    camera_angle: null,
    lens: null,
    frame_rate: null,
    equipment_note: null,
    int_ext: null,
    day_night: null,
    status: "planned",
    notes: null,
    duration_sec: 0,
    setup_min: null,
    custom_values: {},
    talent_ids: [],
    active_frame_id: null,
    frame_path: null,
    ...fields,
  };
}

const segments: Segment[] = [
  { id: "s1", title: "Arrival", description: null, target_duration_sec: 10, position: "a" },
  { id: "s2", title: "The pour", description: null, target_duration_sec: null, position: "b" },
  { id: "s3", title: "Empty", description: null, target_duration_sec: 5, position: "c" },
];
const shots = [
  shot("1", "s1", "a", { action: "Boat enters", duration_sec: 8, shot_size: "wide", talent_ids: ["t1"] }),
  shot("2", "s1", "b", { action: "Rope is thrown", duration_sec: 6, custom_values: { rig: "Gimbal" } }),
  shot("3", "s2", "a", { action: "Coffee, poured", duration_sec: 4, shot_number: "3A" }),
];
const settings: ColumnSetting[] = [
  { id: "c1", key: "audio", label: "audio", type: "builtin", config: {}, position: "a", visible: false },
  { id: "c2", key: "rig", label: "Rig", type: "text", config: {}, position: "b", visible: true },
];
const talentNames = new Map([["t1", "Mara Lind"]]);

describe("shotListExport", () => {
  const columns = visibleColumns(settings);
  const data = shotListExport({ segments, shots }, columns, talentNames);

  it("groups shots by segment in running order, with empty segments kept", () => {
    expect(data.sections.map((section) => [section.segment.title, section.rows.length])).toEqual([
      ["Arrival", 2],
      ["The pour", 1],
      ["Empty", 0],
    ]);
    expect(data.sections.flatMap((section) => section.rows.map((row) => row.number))).toEqual([
      "1",
      "2",
      "3A",
    ]);
  });

  it("carries the totals of the screen view", () => {
    expect(data.sections[0].total).toMatchObject({ totalSec: 14, targetSec: 10, over: true });
    expect(data.sections[1].total).toMatchObject({ totalSec: 4, targetSec: null, over: false });
    expect(data.totals).toMatchObject({ totalSec: 18, targetSec: 15, over: true, shotCount: 3 });
  });

  it("has one text per column for every shot", () => {
    for (const section of data.sections) {
      for (const row of section.rows) expect(row.cells).toHaveLength(columns.length);
    }
  });

  it("writes the CSV with the visible columns in order and without frames", () => {
    const rows = shotListCsvRows(data, columns);
    expect(rows[0]).toEqual([
      "Segment",
      "#",
      "Action",
      "On-screen text",
      "Shot size",
      "Movement",
      "Angle",
      "Lens",
      "INT/EXT",
      "Day/night",
      "Cast",
      "Duration (s)",
      "Status",
      "Note",
      "Rig",
    ]);
    expect(rows).toHaveLength(4);
    expect(rows[1].slice(0, 5)).toEqual(["Arrival", "1", "Boat enters", "", "Wide"]);
    expect(rows[1][10]).toBe("Mara Lind");
    expect(rows[2][14]).toBe("Gimbal");
    expect(rows[3].slice(0, 3)).toEqual(["The pour", "3A", "Coffee, poured"]);
  });
});
