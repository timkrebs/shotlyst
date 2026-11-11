"use client";

import { Pause, Play, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { formatSeconds } from "@/lib/concepts/beats";
import type { Shot } from "@/lib/shots/types";
import { cn } from "@/lib/utils";
import { en } from "@/messages/en";

import { FrameThumb } from "./cells";

const PX_PER_SECOND = 28;
const MIN_WIDTH = 56;

// Frames side by side, each as wide as the shot is long, with audio and
// on-screen text as tracks below. Play steps through the frames in real time.
export function TimelineView({
  shots,
  numbers,
  aspectRatio,
}: {
  shots: Shot[];
  numbers: ReadonlyMap<string, string>;
  aspectRatio: number;
}) {
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const lastTick = useRef<number | null>(null);

  // Start time of every shot, and the total length.
  const { starts, total } = useMemo(() => {
    const list: number[] = [];
    const end = shots.reduce((at, shot) => {
      list.push(at);
      return at + shot.duration_sec;
    }, 0);
    return { starts: list, total: end };
  }, [shots]);

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const tick = (now: number) => {
      const elapsed = lastTick.current === null ? 0 : (now - lastTick.current) / 1000;
      lastTick.current = now;
      setTime((current) => {
        const next = current + elapsed;
        if (next >= total) {
          setPlaying(false);
          return total;
        }
        return next;
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      lastTick.current = null;
    };
  }, [playing, total]);

  if (shots.length === 0) return <p className="text-muted-foreground text-sm">{en.shots.empty}</p>;

  // The shot under the playhead; shots without a duration are skipped.
  let currentIndex = 0;
  for (let index = 0; index < shots.length; index += 1) {
    if (starts[index] <= time && shots[index].duration_sec > 0) currentIndex = index;
  }
  const current = shots[currentIndex];
  const widths = shots.map((shot) => Math.max(MIN_WIDTH, shot.duration_sec * PX_PER_SECOND));
  const labels = en.shots.timeline;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-start gap-4">
        <div
          className="bg-muted w-full max-w-md overflow-hidden rounded-lg border"
          style={{ aspectRatio }}
          data-testid="timeline-preview"
          data-shot={numbers.get(current.id)}
        >
          <FrameThumb path={current.frame_path} />
        </div>
        <div className="grid gap-2 text-sm">
          <p className="font-medium">
            {en.shots.shotLabel(numbers.get(current.id) ?? "", current.action ?? "")}
          </p>
          <p className="text-muted-foreground tabular-nums" data-testid="timeline-clock">
            {formatSeconds(Math.floor(time))} / {formatSeconds(total)}
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={total === 0}
              onClick={() => {
                if (time >= total) setTime(0);
                setPlaying((value) => !value);
              }}
            >
              {playing ? <Pause /> : <Play />}
              {playing ? labels.pause : labels.play}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setPlaying(false);
                setTime(0);
              }}
            >
              <RotateCcw />
              {labels.restart}
            </Button>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border" data-testid="timeline">
        <div className="grid w-max gap-px p-2 text-xs">
          <div className="flex gap-1">
            {shots.map((shot, index) => (
              <button
                key={shot.id}
                type="button"
                style={{ width: widths[index] }}
                aria-label={labels.jumpTo(numbers.get(shot.id) ?? "")}
                className={cn(
                  "bg-muted h-20 shrink-0 overflow-hidden rounded border-2",
                  index === currentIndex ? "border-primary" : "border-transparent",
                )}
                onClick={() => {
                  setPlaying(false);
                  setTime(starts[index]);
                }}
              >
                <FrameThumb path={shot.frame_path} />
              </button>
            ))}
          </div>
          <div className="flex gap-1">
            {shots.map((shot, index) => (
              <p key={shot.id} style={{ width: widths[index] }} className="shrink-0 truncate px-1 tabular-nums">
                {numbers.get(shot.id)} · {formatSeconds(shot.duration_sec)}
              </p>
            ))}
          </div>
          {(["audio", "on_screen_text"] as const).map((track) => (
            <div key={track} className="flex gap-1" aria-label={en.shotColumns[track]}>
              {shots.map((shot, index) => (
                <p
                  key={shot.id}
                  style={{ width: widths[index] }}
                  title={shot[track] ?? ""}
                  className={cn(
                    "h-7 shrink-0 truncate rounded px-1 leading-7",
                    shot[track]
                      ? track === "audio"
                        ? "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200"
                        : "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200"
                      : "bg-muted/40",
                  )}
                >
                  {shot[track]}
                </p>
              ))}
            </div>
          ))}
        </div>
      </div>
      <p className="text-muted-foreground text-xs">{labels.legend}</p>
    </div>
  );
}
