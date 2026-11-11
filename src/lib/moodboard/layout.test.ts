import { describe, expect, it } from "vitest";

import { alignRects, diffRows, fitNodeSize } from "./layout";

const rects = [
  { id: "a", x: 0, y: 0, width: 100, height: 50 },
  { id: "b", x: 200, y: 100, width: 50, height: 100 },
];

describe("alignRects", () => {
  it("aligns to each edge of the common bounding box", () => {
    expect(alignRects(rects, "left").get("b")).toEqual({ x: 0, y: 100 });
    expect(alignRects(rects, "right").get("a")).toEqual({ x: 150, y: 0 });
    expect(alignRects(rects, "top").get("b")).toEqual({ x: 200, y: 0 });
    expect(alignRects(rects, "bottom").get("a")).toEqual({ x: 0, y: 150 });
  });

  it("centres on the shared axis", () => {
    expect(alignRects(rects, "center").get("a")).toEqual({ x: 75, y: 0 });
    expect(alignRects(rects, "center").get("b")).toEqual({ x: 100, y: 100 });
    expect(alignRects(rects, "middle").get("a")).toEqual({ x: 0, y: 75 });
  });

  it("returns nothing for nothing", () => {
    expect(alignRects([], "left").size).toBe(0);
  });
});

describe("diffRows", () => {
  it("finds new, changed and removed rows", () => {
    const saved = new Map([
      ["same", JSON.stringify({ id: "same", x: 1 })],
      ["moved", JSON.stringify({ id: "moved", x: 1 })],
      ["gone", JSON.stringify({ id: "gone", x: 1 })],
    ]);
    const diff = diffRows(saved, [
      { id: "same", x: 1 },
      { id: "moved", x: 2 },
      { id: "new", x: 3 },
    ]);
    expect(diff.changed.map((row) => row.id)).toEqual(["moved", "new"]);
    expect(diff.removedIds).toEqual(["gone"]);
  });

  it("reports nothing when nothing changed", () => {
    const saved = new Map([["a", JSON.stringify({ id: "a", x: 1 })]]);
    expect(diffRows(saved, [{ id: "a", x: 1 }])).toEqual({ changed: [], removedIds: [] });
  });
});

describe("fitNodeSize", () => {
  it("keeps the aspect ratio", () => {
    expect(fitNodeSize(1920, 1080, 320)).toEqual({ width: 320, height: 180 });
    expect(fitNodeSize(500, 1000, 320)).toEqual({ width: 160, height: 320 });
    expect(fitNodeSize(null, null, 320)).toEqual({ width: 320, height: 320 });
  });
});
