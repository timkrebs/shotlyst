// Pure logic for the beat rail: where beats sit on the film's timeline and
// where they overlap or leave gaps. Nothing here is stored.

export interface BeatWindow {
  id: string;
  startSec: number;
  endSec: number;
}

export interface BeatIssue {
  kind: "overlap" | "gap";
  // The two beats on either side, in timeline order.
  beforeId: string;
  afterId: string;
  seconds: number;
}

export interface BeatLayout {
  id: string;
  // Fractions of the total length, 0 to 1.
  offset: number;
  length: number;
  overlaps: boolean;
}

export interface BeatAnalysis {
  totalSec: number;
  layout: BeatLayout[];
  issues: BeatIssue[];
}

export function analyzeBeats(beats: BeatWindow[]): BeatAnalysis {
  const sorted = [...beats].sort((a, b) => a.startSec - b.startSec || a.endSec - b.endSec);
  const totalSec = sorted.reduce((max, beat) => Math.max(max, beat.endSec), 0);
  const issues: BeatIssue[] = [];
  const overlapping = new Set<string>();

  // Compare each beat with the one that reaches furthest so far, so a beat
  // nested inside a long one is still caught.
  let furthest: BeatWindow | null = null;
  for (const beat of sorted) {
    if (furthest) {
      const delta = beat.startSec - furthest.endSec;
      if (delta < 0) {
        overlapping.add(furthest.id).add(beat.id);
        issues.push({
          kind: "overlap",
          beforeId: furthest.id,
          afterId: beat.id,
          seconds: Math.min(-delta, beat.endSec - beat.startSec),
        });
      } else if (delta > 0) {
        issues.push({ kind: "gap", beforeId: furthest.id, afterId: beat.id, seconds: delta });
      }
    }
    if (!furthest || beat.endSec > furthest.endSec) furthest = beat;
  }

  const layout = beats.map((beat) => ({
    id: beat.id,
    offset: totalSec > 0 ? beat.startSec / totalSec : 0,
    length: totalSec > 0 ? (beat.endSec - beat.startSec) / totalSec : 0,
    overlaps: overlapping.has(beat.id),
  }));
  return { totalSec, layout, issues };
}

// 95 -> "1:35"
export function formatSeconds(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

// "1:35" or "95" -> 95; null when it is neither.
export function parseSeconds(text: string): number | null {
  const trimmed = text.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  const match = /^(\d+):([0-5]?\d)$/.exec(trimmed);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}
