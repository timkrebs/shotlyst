import { describe, expect, it } from "vitest";

import { dominantColors } from "./palette";

function pixels(...runs: [number, [number, number, number, number?]][]): number[] {
  return runs.flatMap(([n, [r, g, b, a = 255]]) => Array.from({ length: n }, () => [r, g, b, a]).flat());
}

describe("dominantColors", () => {
  it("returns colours by frequency", () => {
    const data = pixels([50, [255, 0, 0]], [30, [0, 0, 255]], [10, [0, 255, 0]]);
    expect(dominantColors(data, 3)).toEqual(["#ff0000", "#0000ff", "#00ff00"]);
  });

  it("merges near-identical shades before listing them separately", () => {
    const data = pixels(
      [40, [200, 30, 30]],
      [35, [215, 40, 40]],
      [20, [20, 20, 200]],
      [5, [240, 240, 240]],
    );
    const colors = dominantColors(data, 3);
    expect(colors).toHaveLength(3);
    expect(colors[0]).toBe("#c81e1e");
    expect(colors).toContain("#1414c8");
    expect(colors).toContain("#f0f0f0");
  });

  it("ignores transparent pixels and copes with few colours", () => {
    const data = pixels([10, [0, 0, 0, 0]], [4, [10, 20, 30]]);
    expect(dominantColors(data, 5)).toEqual(["#0a141e"]);
    expect(dominantColors([], 5)).toEqual([]);
  });
});
