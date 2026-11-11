"use client";

import { Download } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatSeconds } from "@/lib/concepts/beats";
import { usePermissions } from "@/lib/permissions/use-permissions";
import type { ShotColumn } from "@/lib/shots/columns";
import { orderShots, shotListTotals, shotNumbers } from "@/lib/shots/totals";
import type { CustomColumn, ShotList } from "@/lib/shots/types";
import { cn } from "@/lib/utils";
import { en } from "@/messages/en";

import type { TalentName } from "../queries";
import { useShotList } from "../use-shot-list";
import { ColumnsDialog } from "./columns-dialog";
import { FramesDialog } from "./frames-dialog";
import { ScriptView } from "./script-view";
import { ShotListView } from "./shot-list-view";
import { StoryboardView } from "./storyboard-view";
import { TimelineView } from "./timeline-view";

const VIEWS = ["list", "storyboard", "timeline", "script"] as const;
type View = (typeof VIEWS)[number];

function Total({
  label,
  totalSec,
  targetSec,
  testId,
}: {
  label: string;
  totalSec: number;
  targetSec: number | null;
  testId: string;
}) {
  const over = targetSec !== null && totalSec > targetSec;
  return (
    <p className="text-sm" data-testid={testId} data-over={over ? "true" : "false"}>
      <span className="text-muted-foreground">{label} </span>
      <span
        className={cn(
          "font-medium tabular-nums",
          targetSec === null ? "" : over ? "text-red-600" : "text-green-600",
        )}
      >
        {formatSeconds(totalSec)}
        {targetSec !== null ? ` / ${formatSeconds(targetSec)}` : ""}
      </span>
    </p>
  );
}

// Four views of the same shots: list, storyboard grid, timeline and script.
export function ShotListWorkspace({
  projectId,
  creative,
  aspectRatio,
  initial,
  columns,
  customColumns,
  initialTalents,
  otherCreatives,
}: {
  projectId: string;
  creative: { id: string; title: string };
  // Width divided by height of the film.
  aspectRatio: number;
  initial: ShotList;
  columns: (ShotColumn & { visible: boolean })[];
  customColumns: CustomColumn[];
  initialTalents: TalentName[];
  // Runtime and targets of the project's other creatives, for the project total.
  otherCreatives: { totalSec: number; targetSec: number | null };
}) {
  const { canEdit } = usePermissions(projectId);
  const [view, setView] = useState<View>("list");
  const [framesFor, setFramesFor] = useState<string | null>(null);
  const [created, setCreated] = useState<TalentName[]>([]);
  const store = useShotList(projectId, creative.id, initial);
  const { segments, shots, actions } = store;

  const visible = useMemo(() => columns.filter((column) => column.visible), [columns]);
  const ordered = useMemo(() => orderShots(segments, shots), [segments, shots]);
  const numbers = useMemo(() => shotNumbers(segments, shots), [segments, shots]);
  const totals = useMemo(() => shotListTotals(segments, shots), [segments, shots]);
  // The library as loaded, plus talents created from a cast cell since then.
  const talents = useMemo(
    () => new Map([...initialTalents, ...created].map((talent) => [talent.id, talent])),
    [created, initialTalents],
  );
  const listActions = useMemo(
    () => ({
      ...actions,
      addCastByName: async (shotId: string, name: string) => {
        const talent = await actions.addCastByName(shotId, name);
        if (talent) setCreated((current) => [...current, talent]);
        return talent;
      },
    }),
    [actions],
  );
  const listStore = useMemo(() => ({ segments, shots, actions: listActions }), [listActions, segments, shots]);

  const projectTarget =
    totals.targetSec === null && otherCreatives.targetSec === null
      ? null
      : (totals.targetSec ?? 0) + (otherCreatives.targetSec ?? 0);
  const framesShot = shots.find((shot) => shot.id === framesFor);
  const exportBase = `/api/export`;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 print:hidden">
        <Total
          label={en.shots.totals.creative}
          totalSec={totals.totalSec}
          targetSec={totals.targetSec}
          testId="creative-total"
        />
        <Total
          label={en.shots.totals.project}
          totalSec={totals.totalSec + otherCreatives.totalSec}
          targetSec={projectTarget}
          testId="project-total"
        />
        <p className="text-muted-foreground text-sm">{en.shots.shotCount(totals.shotCount)}</p>
      </div>

      <div className="flex flex-wrap items-center gap-1 print:hidden">
        <div role="tablist" aria-label={en.shots.views.label} className="flex gap-1">
          {VIEWS.map((item) => (
            <Button
              key={item}
              role="tab"
              aria-selected={view === item}
              variant={view === item ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setView(item)}
            >
              {en.shots.views[item]}
            </Button>
          ))}
        </div>
        <div className="ml-auto flex gap-2">
          {canEdit && view === "list" ? (
            <ColumnsDialog projectId={projectId} columns={columns} custom={customColumns} />
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Download />
                {en.shots.export.button}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <a href={`${exportBase}/shotlist/${creative.id}?format=pdf`}>{en.shots.export.shotListPdf}</a>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a href={`${exportBase}/shotlist/${creative.id}?format=csv`}>{en.shots.export.shotListCsv}</a>
              </DropdownMenuItem>
              {[6, 9, 12].map((perPage) => (
                <DropdownMenuItem key={perPage} asChild>
                  <a href={`${exportBase}/storyboard/${creative.id}?perPage=${perPage}`}>
                    {en.shots.export.storyboardPdf(perPage)}
                  </a>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {view === "list" ? (
        <ShotListView
          store={listStore}
          columns={visible}
          talents={talents}
          canEdit={canEdit}
          onOpenFrames={setFramesFor}
        />
      ) : view === "storyboard" ? (
        <StoryboardView
          shots={ordered}
          segments={segments}
          numbers={numbers}
          aspectRatio={aspectRatio}
          onOpenFrames={setFramesFor}
        />
      ) : view === "timeline" ? (
        <TimelineView shots={ordered} numbers={numbers} aspectRatio={aspectRatio} />
      ) : (
        <ScriptView title={creative.title} shots={ordered} segments={segments} numbers={numbers} />
      )}

      {framesShot ? (
        <FramesDialog
          projectId={projectId}
          shotId={framesShot.id}
          shotNumber={numbers.get(framesShot.id) ?? ""}
          activeFrameId={framesShot.active_frame_id}
          aspectRatio={aspectRatio}
          canEdit={canEdit}
          onChanged={() => void actions.reload()}
          onClose={() => setFramesFor(null)}
        />
      ) : null}
    </div>
  );
}
