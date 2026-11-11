"use client";

import { useState } from "react";

import { formatSeconds } from "@/lib/concepts/beats";
import { vocabLabel } from "@/lib/film/vocab";
import type { Segment, Shot } from "@/lib/shots/types";
import { en } from "@/messages/en";

import { FrameThumb } from "./cells";

const PER_ROW = [2, 3, 4, 5, 6];

// Cards with the frame in the film's aspect ratio, in running order.
export function StoryboardView({
  shots,
  segments,
  numbers,
  aspectRatio,
  onOpenFrames,
}: {
  shots: Shot[];
  segments: Segment[];
  numbers: ReadonlyMap<string, string>;
  aspectRatio: number;
  onOpenFrames: (shotId: string) => void;
}) {
  const [perRow, setPerRow] = useState(4);
  const segmentTitle = new Map(segments.map((segment) => [segment.id, segment.title]));

  if (shots.length === 0) return <p className="text-muted-foreground text-sm">{en.shots.empty}</p>;

  return (
    <div className="grid gap-4">
      <label className="flex items-center gap-3 text-sm">
        {en.shots.storyboard.perRow}
        <input
          type="range"
          min={PER_ROW[0]}
          max={PER_ROW[PER_ROW.length - 1]}
          value={perRow}
          onChange={(event) => setPerRow(Number(event.target.value))}
        />
        <span className="tabular-nums">{perRow}</span>
      </label>
      <ul
        className="grid gap-4"
        data-testid="storyboard"
        style={{ gridTemplateColumns: `repeat(${perRow}, minmax(0, 1fr))` }}
      >
        {shots.map((shot) => {
          const number = numbers.get(shot.id) ?? "";
          return (
            <li key={shot.id} className="bg-card overflow-hidden rounded-lg border">
              <button
                type="button"
                className="block w-full"
                style={{ aspectRatio }}
                aria-label={en.shots.framesOf(number)}
                onClick={() => onOpenFrames(shot.id)}
              >
                <FrameThumb path={shot.frame_path} />
              </button>
              <div className="grid gap-1 p-2 text-sm">
                <p className="flex items-baseline gap-2">
                  <span className="font-semibold tabular-nums">{number}</span>
                  <span className="text-muted-foreground truncate">
                    {vocabLabel("shotSize", shot.shot_size)}
                  </span>
                  <span className="text-muted-foreground ml-auto tabular-nums">
                    {formatSeconds(shot.duration_sec)}
                  </span>
                </p>
                <p className="line-clamp-3">{shot.action}</p>
                <p className="text-muted-foreground truncate text-xs">
                  {segmentTitle.get(shot.segment_id)}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
