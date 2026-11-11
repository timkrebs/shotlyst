// Pulls dominant colours out of image pixels. Pure: the caller supplies RGBA
// bytes (for example from a canvas), so it runs without a DOM.

function toHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((value) => Math.round(value).toString(16).padStart(2, "0")).join("")}`;
}

function distance(a: number[], b: number[]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

// The `count` most common colours that are visibly different from each
// other, most common first. Pixels are grouped into coarse buckets, and each
// bucket is reported as the average of its pixels.
export function dominantColors(rgba: Uint8ClampedArray | number[], count = 5): string[] {
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    // Skip mostly transparent pixels.
    if (rgba[i + 3] < 128) continue;
    const r = rgba[i];
    const g = rgba[i + 1];
    const b = rgba[i + 2];
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.n += 1;
      bucket.r += r;
      bucket.g += g;
      bucket.b += b;
    } else {
      buckets.set(key, { n: 1, r, g, b });
    }
  }

  const ranked = [...buckets.values()]
    .sort((a, b) => b.n - a.n)
    .map((bucket) => [bucket.r / bucket.n, bucket.g / bucket.n, bucket.b / bucket.n]);

  // Take colours in order of frequency, relaxing the minimum difference until
  // enough are found, so near-duplicates only appear when nothing else is left.
  for (const threshold of [72, 48, 24, 0]) {
    const picked: number[][] = [];
    for (const color of ranked) {
      if (picked.every((other) => distance(color, other) > threshold)) picked.push(color);
      if (picked.length === count) break;
    }
    if (picked.length === count || threshold === 0) {
      return picked.map(([r, g, b]) => toHex(r, g, b));
    }
  }
  return [];
}
