import { describe, expect, it } from "vitest";

import { analyzeBeats, formatSeconds, parseSeconds } from "./beats";

describe("analyzeBeats", () => {
  it("lays beats out over the total length", () => {
    const result = analyzeBeats([
      { id: "a", startSec: 0, endSec: 10 },
      { id: "b", startSec: 10, endSec: 30 },
      { id: "c", startSec: 30, endSec: 40 },
    ]);
    expect(result.totalSec).toBe(40);
    expect(result.issues).toEqual([]);
    expect(result.layout).toEqual([
      { id: "a", offset: 0, length: 0.25, overlaps: false },
      { id: "b", offset: 0.25, length: 0.5, overlaps: false },
      { id: "c", offset: 0.75, length: 0.25, overlaps: false },
    ]);
  });

  it("flags a gap between two beats", () => {
    const { issues } = analyzeBeats([
      { id: "a", startSec: 0, endSec: 10 },
      { id: "b", startSec: 14, endSec: 20 },
    ]);
    expect(issues).toEqual([{ kind: "gap", beforeId: "a", afterId: "b", seconds: 4 }]);
  });

  it("flags an overlap and marks both beats, whatever the input order", () => {
    const { issues, layout } = analyzeBeats([
      { id: "b", startSec: 8, endSec: 20 },
      { id: "a", startSec: 0, endSec: 10 },
    ]);
    expect(issues).toEqual([{ kind: "overlap", beforeId: "a", afterId: "b", seconds: 2 }]);
    expect(layout.every((beat) => beat.overlaps)).toBe(true);
  });

  it("catches a beat nested inside a longer one and the beat after it", () => {
    const { issues } = analyzeBeats([
      { id: "long", startSec: 0, endSec: 30 },
      { id: "inner", startSec: 5, endSec: 10 },
      { id: "late", startSec: 20, endSec: 40 },
    ]);
    expect(issues).toEqual([
      { kind: "overlap", beforeId: "long", afterId: "inner", seconds: 5 },
      { kind: "overlap", beforeId: "long", afterId: "late", seconds: 10 },
    ]);
  });

  it("handles no beats", () => {
    expect(analyzeBeats([])).toEqual({ totalSec: 0, layout: [], issues: [] });
  });
});

describe("seconds", () => {
  it("formats and parses m:ss", () => {
    expect(formatSeconds(95)).toBe("1:35");
    expect(formatSeconds(5)).toBe("0:05");
    expect(parseSeconds("1:35")).toBe(95);
    expect(parseSeconds("95")).toBe(95);
    expect(parseSeconds(" 0:07 ")).toBe(7);
    expect(parseSeconds("1:75")).toBeNull();
    expect(parseSeconds("soon")).toBeNull();
  });
});
