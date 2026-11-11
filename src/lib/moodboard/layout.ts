// Pure canvas helpers: aligning rectangles and finding what changed since
// the last save.

export interface Rect {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export type Alignment = "left" | "center" | "right" | "top" | "middle" | "bottom";

// New top-left positions that line the rectangles up along one edge or axis
// of their common bounding box.
export function alignRects(rects: Rect[], alignment: Alignment): Map<string, { x: number; y: number }> {
  const result = new Map<string, { x: number; y: number }>();
  if (rects.length === 0) return result;
  const left = Math.min(...rects.map((rect) => rect.x));
  const right = Math.max(...rects.map((rect) => rect.x + rect.width));
  const top = Math.min(...rects.map((rect) => rect.y));
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.height));

  for (const rect of rects) {
    let { x, y } = rect;
    if (alignment === "left") x = left;
    if (alignment === "right") x = right - rect.width;
    if (alignment === "center") x = (left + right) / 2 - rect.width / 2;
    if (alignment === "top") y = top;
    if (alignment === "bottom") y = bottom - rect.height;
    if (alignment === "middle") y = (top + bottom) / 2 - rect.height / 2;
    result.set(rect.id, { x, y });
  }
  return result;
}

export interface RowDiff<T> {
  changed: T[];
  removedIds: string[];
}

// Compares rows with the serialised copies kept from the last save.
export function diffRows<T extends { id: string }>(
  saved: ReadonlyMap<string, string>,
  current: T[],
): RowDiff<T> {
  const changed = current.filter((row) => saved.get(row.id) !== JSON.stringify(row));
  const currentIds = new Set(current.map((row) => row.id));
  const removedIds = [...saved.keys()].filter((id) => !currentIds.has(id));
  return { changed, removedIds };
}

// A size that fits inside a square of `maxEdge`, keeping the aspect ratio.
export function fitNodeSize(width: number | null, height: number | null, maxEdge: number) {
  if (!width || !height) return { width: maxEdge, height: maxEdge };
  const scale = maxEdge / Math.max(width, height);
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}
