import { describe, expect, it } from "vitest";

import { toCsv } from "@/lib/csv";

import { centreCrop, parseAspectRatio } from "./aspect";
import { allColumns, cellText, customColumns, visibleColumns, type ColumnSetting } from "./columns";
import { orderShots, shotListTotals, shotNumbers } from "./totals";
import type { Segment, Shot } from "./types";

const segment = (id: string, position: string, target: number | null): Segment => ({
  id,
  title: id,
  description: null,
  target_duration_sec: target,
  position,
});

const shot = (id: string, segmentId: string, position: string, duration: number): Shot => ({
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
  duration_sec: duration,
  setup_min: null,
  custom_values: {},
  talent_ids: [],
  active_frame_id: null,
  frame_path: null,
});

const segments = [segment("opening", "G", 10), segment("pour", "V", 12), segment("end", "k", null)];
const shots = [
  shot("c", "pour", "G", 8),
  shot("a", "opening", "G", 4),
  shot("d", "pour", "V", 7),
  shot("b", "opening", "V", 5),
];

describe("shotListTotals", () => {
  it("sums durations per segment and flags the ones over target", () => {
    const totals = shotListTotals(segments, shots);
    expect(totals.segments.get("opening")).toMatchObject({ totalSec: 9, over: false, shotCount: 2 });
    expect(totals.segments.get("pour")).toMatchObject({ totalSec: 15, targetSec: 12, over: true });
    expect(totals.segments.get("end")).toMatchObject({ totalSec: 0, targetSec: null, over: false });
  });

  it("is green up to the target and red only above it", () => {
    const exact = shotListTotals([segment("s", "V", 9)], [shot("x", "s", "V", 9)]);
    expect(exact.segments.get("s")?.over).toBe(false);
    const above = shotListTotals([segment("s", "V", 9)], [shot("x", "s", "V", 10)]);
    expect(above.segments.get("s")?.over).toBe(true);
  });

  it("totals the whole list against the sum of the targets", () => {
    expect(shotListTotals(segments, shots)).toMatchObject({
      totalSec: 24,
      targetSec: 22,
      over: true,
      shotCount: 4,
    });
    expect(shotListTotals([segment("s", "V", null)], []).targetSec).toBeNull();
  });
});

describe("running order", () => {
  it("orders by segment, then by position, and numbers from 1", () => {
    expect(orderShots(segments, shots).map((item) => item.id)).toEqual(["a", "b", "c", "d"]);
    expect([...shotNumbers(segments, shots).entries()]).toEqual([
      ["a", "1"],
      ["b", "2"],
      ["c", "3"],
      ["d", "4"],
    ]);
  });

  it("lets a shot's own label replace the running number", () => {
    const labelled = shots.map((item) => (item.id === "b" ? { ...item, shot_number: "2A" } : item));
    expect(shotNumbers(segments, labelled).get("b")).toBe("2A");
    expect(shotNumbers(segments, labelled).get("c")).toBe("3");
  });
});

describe("columns", () => {
  const settings: ColumnSetting[] = [
    { id: "1", key: "audio", label: "", type: "builtin", config: {}, position: "V", visible: false },
    { id: "2", key: "setup_min", label: "", type: "builtin", config: {}, position: "V", visible: true },
    { id: "3", key: "vfx", label: "VFX", type: "checkbox", config: {}, position: "k", visible: true },
    { id: "4", key: "unit", label: "Unit", type: "select", config: { options: ["A", "B"] }, position: "V", visible: true },
    { id: "5", key: "old", label: "Old", type: "text", config: {}, position: "z", visible: false },
  ];

  it("applies stored visibility to built-in columns and appends custom ones in order", () => {
    const keys = visibleColumns(settings).map((column) => column.key);
    expect(keys).not.toContain("audio");
    expect(keys).toContain("setup_min");
    expect(keys).not.toContain("frame_rate");
    expect(keys.slice(-2)).toEqual(["unit", "vfx"]);
    expect(allColumns(settings).find((column) => column.key === "old")?.visible).toBe(false);
    expect(customColumns(settings).map((column) => column.key)).toEqual(["unit", "vfx", "old"]);
    expect(customColumns(settings)[0].options).toEqual(["A", "B"]);
  });

  it("renders cell text with labels, cast names and custom values", () => {
    const columns = allColumns(settings);
    const column = (key: string) => columns.find((item) => item.key === key)!;
    const names = new Map([["t1", "Mara"], ["t2", "Espresso machine"]]);
    const item: Shot = {
      ...shot("a", "opening", "G", 4),
      shot_size: "close_up",
      int_ext: "ext",
      action: "Steam rises",
      talent_ids: ["t1", "t2", "gone"],
      custom_values: { vfx: true, unit: "B" },
    };
    expect(cellText(item, column("shot_size"), names)).toBe("Close-up");
    expect(cellText(item, column("int_ext"), names)).toBe("EXT");
    expect(cellText(item, column("action"), names)).toBe("Steam rises");
    expect(cellText(item, column("duration_sec"), names)).toBe("4");
    expect(cellText(item, column("cast"), names)).toBe("Mara, Espresso machine");
    expect(cellText(item, column("vfx"), names)).toBe("Yes");
    expect(cellText(item, column("unit"), names)).toBe("B");
    expect(cellText(item, column("lens"), names)).toBe("");
    expect(cellText(item, column("frame"), names)).toBe("");
  });
});

describe("aspect ratios", () => {
  it("parses ratios and falls back to 16:9", () => {
    expect(parseAspectRatio("16:9")).toBeCloseTo(1.7778, 3);
    expect(parseAspectRatio("2.39:1")).toBeCloseTo(2.39);
    expect(parseAspectRatio("4:5")).toBe(0.8);
    expect(parseAspectRatio("wide")).toBeCloseTo(16 / 9);
    expect(parseAspectRatio(null)).toBeCloseTo(16 / 9);
  });

  it("crops the centre to the target ratio", () => {
    expect(centreCrop(4000, 3000, 16 / 9)).toEqual({ x: 0, y: 375, width: 4000, height: 2250 });
    expect(centreCrop(4000, 3000, 1)).toEqual({ x: 500, y: 0, width: 3000, height: 3000 });
    expect(centreCrop(1920, 1080, 16 / 9)).toEqual({ x: 0, y: 0, width: 1920, height: 1080 });
  });
});

describe("toCsv", () => {
  it("quotes commas, quotes and line breaks and starts with a byte-order mark", () => {
    expect(toCsv([["#", "Action"], ["1", 'He says "go", twice\nand leaves']])).toBe(
      '﻿#,Action\r\n1,"He says ""go"", twice\nand leaves"\r\n',
    );
  });

  it("defuses cells a spreadsheet would run as formulas", () => {
    expect(toCsv([["=SUM(A1)", "-5", "+1", "@x", "plain"]])).toBe(
      "﻿'=SUM(A1),'-5,'+1,'@x,plain\r\n",
    );
  });
});
