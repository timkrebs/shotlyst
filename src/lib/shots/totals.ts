import { comparePositions } from "@/lib/position";

import type { Segment, Shot } from "./types";

// Totals of the shot list. They are computed from the shots every time and
// never stored.

export interface SegmentTotal {
  segmentId: string;
  totalSec: number;
  targetSec: number | null;
  // True when the shots run longer than the segment's target.
  over: boolean;
  shotCount: number;
}

export interface ShotListTotals {
  segments: Map<string, SegmentTotal>;
  totalSec: number;
  // Sum of the segment targets; null when no segment has one.
  targetSec: number | null;
  over: boolean;
  shotCount: number;
}

export function shotListTotals(segments: Segment[], shots: Shot[]): ShotListTotals {
  const bySegment = new Map<string, SegmentTotal>(
    segments.map((segment) => [
      segment.id,
      {
        segmentId: segment.id,
        totalSec: 0,
        targetSec: segment.target_duration_sec,
        over: false,
        shotCount: 0,
      },
    ]),
  );
  for (const shot of shots) {
    const total = bySegment.get(shot.segment_id);
    if (!total) continue;
    total.totalSec += shot.duration_sec;
    total.shotCount += 1;
  }
  for (const total of bySegment.values()) {
    total.over = total.targetSec !== null && total.totalSec > total.targetSec;
  }

  const all = [...bySegment.values()];
  const totalSec = all.reduce((sum, total) => sum + total.totalSec, 0);
  const targets = all.filter((total) => total.targetSec !== null);
  const targetSec =
    targets.length > 0 ? targets.reduce((sum, total) => sum + (total.targetSec ?? 0), 0) : null;
  return {
    segments: bySegment,
    totalSec,
    targetSec,
    over: targetSec !== null && totalSec > targetSec,
    shotCount: all.reduce((sum, total) => sum + total.shotCount, 0),
  };
}

// Shots in running order: by segment, then by position inside the segment.
export function orderShots(segments: Segment[], shots: Shot[]): Shot[] {
  const segmentOrder = new Map(
    [...segments]
      .sort((a, b) => comparePositions(a.position, b.position))
      .map((segment, index) => [segment.id, index]),
  );
  return [...shots].sort(
    (a, b) =>
      (segmentOrder.get(a.segment_id) ?? 0) - (segmentOrder.get(b.segment_id) ?? 0) ||
      comparePositions(a.position, b.position),
  );
}

// The number shown for each shot: its place in the running order, or its
// own label when one is set.
export function shotNumbers(segments: Segment[], shots: Shot[]): Map<string, string> {
  return new Map(
    orderShots(segments, shots).map((shot, index) => [
      shot.id,
      shot.shot_number?.trim() || String(index + 1),
    ]),
  );
}
