import { describe, expect, it } from "vitest";

import { comparePositions, positionAfter, positionAt, positionBetween } from "./position";

describe("positionBetween", () => {
  it("starts in the middle of the alphabet", () => {
    expect(positionBetween(null, null)).toBe("V");
  });

  it("returns a key strictly between its neighbours", () => {
    const cases: [string | null, string | null][] = [
      [null, "V"],
      ["V", null],
      ["V", "W"],
      ["V", "V1"],
      ["Vz", "W"],
      ["A", "B"],
      ["zzz", null],
      [null, "1"],
      [null, "01"],
    ];
    for (const [before, after] of cases) {
      const key = positionBetween(before, after);
      if (before !== null) expect(before < key).toBe(true);
      if (after !== null) expect(key < after).toBe(true);
      expect(key.endsWith("0")).toBe(false);
    }
  });

  it("keeps working after many inserts at the same spot", () => {
    let low = "V";
    const high = "W";
    for (let i = 0; i < 200; i += 1) {
      const key = positionBetween(low, high);
      expect(low < key && key < high).toBe(true);
      low = key;
    }
    let first: string | null = null;
    for (let i = 0; i < 200; i += 1) {
      const key = positionBetween(null, first);
      if (first !== null) expect(key < first).toBe(true);
      first = key;
    }
  });

  it("rejects invalid or unordered keys", () => {
    expect(() => positionBetween("b", "a")).toThrow();
    expect(() => positionBetween("a", "a")).toThrow();
    expect(() => positionBetween("a0", null)).toThrow();
    expect(() => positionBetween("a-b", null)).toThrow();
  });
});

describe("positionAfter and positionAt", () => {
  it("appends in order", () => {
    const keys: string[] = [];
    for (let i = 0; i < 100; i += 1) keys.push(positionAfter(keys[keys.length - 1] ?? null));
    expect([...keys].sort(comparePositions)).toEqual(keys);
    expect(new Set(keys).size).toBe(100);
  });

  it("places an item at an index of the remaining list", () => {
    const list = ["G", "V", "k"];
    expect(positionAt(list, 0) < "G").toBe(true);
    const middle = positionAt(list, 1);
    expect("G" < middle && middle < "V").toBe(true);
    expect(positionAt(list, 3) > "k").toBe(true);
    expect(positionAt(list, 99) > "k").toBe(true);
    expect(positionAt([], 0)).toBe("V");
  });
});

describe("comparePositions", () => {
  it("orders bytes, not letters: digits, upper case, lower case", () => {
    expect(["a", "B", "1"].sort(comparePositions)).toEqual(["1", "B", "a"]);
  });
});
