"use client";

import { Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatSeconds } from "@/lib/concepts/beats";
import { vocabLabel } from "@/lib/film/vocab";
import type { Segment, Shot } from "@/lib/shots/types";
import { en } from "@/messages/en";

// Two columns, picture and sound, for reading and printing.
export function ScriptView({
  title,
  shots,
  segments,
  numbers,
}: {
  title: string;
  shots: Shot[];
  segments: Segment[];
  numbers: ReadonlyMap<string, string>;
}) {
  const labels = en.shots.script;
  if (shots.length === 0) return <p className="text-muted-foreground text-sm">{en.shots.empty}</p>;

  return (
    <div className="mx-auto grid w-full max-w-4xl gap-4">
      <div className="flex items-center justify-between print:hidden">
        <p className="text-muted-foreground text-sm">{labels.hint}</p>
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          <Printer />
          {labels.print}
        </Button>
      </div>
      <h2 className="hidden text-xl font-semibold print:block">{title}</h2>
      <table className="w-full border-collapse text-sm" data-testid="script">
        <thead>
          <tr className="border-b text-left">
            <th scope="col" className="w-12 py-2 pr-2 font-medium">
              {en.shotColumns.number}
            </th>
            <th scope="col" className="w-1/2 py-2 pr-4 font-medium">
              {labels.picture}
            </th>
            <th scope="col" className="py-2 font-medium">
              {labels.sound}
            </th>
          </tr>
        </thead>
        {segments.map((segment) => {
          const rows = shots.filter((shot) => shot.segment_id === segment.id);
          if (rows.length === 0) return null;
          return (
            <tbody key={segment.id}>
              <tr>
                <th
                  scope="rowgroup"
                  colSpan={3}
                  className="bg-muted/60 px-2 py-1.5 text-left text-xs font-semibold tracking-wide uppercase"
                >
                  {segment.title}
                </th>
              </tr>
              {rows.map((shot) => (
                <tr key={shot.id} className="break-inside-avoid border-b align-top">
                  <td className="py-2 pr-2 tabular-nums">{numbers.get(shot.id)}</td>
                  <td className="py-2 pr-4">
                    <p className="whitespace-pre-wrap">{shot.action}</p>
                    <p className="text-muted-foreground text-xs">
                      {[
                        vocabLabel("shotSize", shot.shot_size),
                        vocabLabel("cameraMovement", shot.camera_movement),
                        formatSeconds(shot.duration_sec),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </td>
                  <td className="py-2">
                    <p className="whitespace-pre-wrap">{shot.audio}</p>
                    {shot.on_screen_text ? (
                      <p className="mt-1 font-medium">
                        {labels.onScreen}: {shot.on_screen_text}
                      </p>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          );
        })}
      </table>
    </div>
  );
}
