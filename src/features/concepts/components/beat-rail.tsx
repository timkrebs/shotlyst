"use client";

import { Pencil, Plus, Trash2, X } from "lucide-react";
import { useState, type FormEvent } from "react";

import { FormError, FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAction } from "@/hooks/use-action";
import { analyzeBeats, formatSeconds, parseSeconds } from "@/lib/concepts/beats";
import { cn } from "@/lib/utils";
import { en } from "@/messages/en";

import { beatsToSegments } from "@/features/shots/actions";

import { addBeatItem, deleteBeat, deleteBeatItem, saveBeat, toggleBeatItem } from "../actions";
import type { Beat } from "../queries";

// Beats beside the text: each with a time window, drawn as bars over the
// film's total length, with open items underneath.
export function BeatRail({
  projectId,
  conceptId,
  beats,
  canEdit,
}: {
  projectId: string;
  conceptId: string;
  beats: Beat[];
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState<Beat | "new" | null>(null);
  const [timeError, setTimeError] = useState<string | null>(null);
  const save = useAction(saveBeat, { inlineError: true, onSuccess: () => setEditing(null) });
  const remove = useAction(deleteBeat);
  const addItem = useAction(addBeatItem);
  const toggleItem = useAction(toggleBeatItem);
  const removeItem = useAction(deleteBeatItem);
  const toSegments = useAction(beatsToSegments);

  const analysis = analyzeBeats(beats);
  const layout = new Map(analysis.layout.map((entry) => [entry.id, entry]));
  const titleOf = (id: string) => beats.find((beat) => beat.id === id)?.title ?? "";
  const current = editing && editing !== "new" ? editing : null;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const startSec = parseSeconds(String(form.get("start") ?? ""));
    const endSec = parseSeconds(String(form.get("end") ?? ""));
    if (startSec === null || endSec === null) {
      setTimeError(en.concepts.errors.timeFormat);
      return;
    }
    setTimeError(null);
    save.run({
      projectId,
      conceptId,
      beatId: current?.id ?? null,
      title: String(form.get("title") ?? ""),
      description: String(form.get("description") ?? ""),
      startSec,
      endSec,
    });
  }

  return (
    <aside aria-label={en.concepts.beats.title} className="grid content-start gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">
          {en.concepts.beats.title}
          {analysis.totalSec > 0 ? (
            <span className="text-muted-foreground font-normal">
              {" "}
              · {formatSeconds(analysis.totalSec)}
            </span>
          ) : null}
        </h2>
        {canEdit ? (
          <Button variant="outline" size="sm" onClick={() => setEditing("new")}>
            <Plus />
            {en.concepts.beats.add}
          </Button>
        ) : null}
      </div>

      {beats.length === 0 ? (
        <p className="text-muted-foreground text-sm">{en.concepts.beats.empty}</p>
      ) : (
        <div className="bg-muted relative h-6 overflow-hidden rounded-md" aria-hidden>
          {beats.map((beat) => {
            const bar = layout.get(beat.id);
            if (!bar) return null;
            return (
              <div
                key={beat.id}
                title={beat.title}
                className={cn(
                  "absolute inset-y-0 border-x border-white/60",
                  bar.overlaps ? "bg-destructive/70" : "bg-primary/70",
                )}
                style={{ left: `${bar.offset * 100}%`, width: `${bar.length * 100}%` }}
              />
            );
          })}
        </div>
      )}

      {analysis.issues.length > 0 ? (
        <ul className="grid gap-1 text-xs" data-testid="beat-issues">
          {analysis.issues.map((issue) => (
            <li
              key={`${issue.kind}-${issue.beforeId}-${issue.afterId}`}
              className={issue.kind === "overlap" ? "text-destructive" : "text-amber-600"}
            >
              {issue.kind === "overlap"
                ? en.concepts.beats.overlap(
                    formatSeconds(issue.seconds),
                    titleOf(issue.beforeId),
                    titleOf(issue.afterId),
                  )
                : en.concepts.beats.gap(
                    formatSeconds(issue.seconds),
                    titleOf(issue.beforeId),
                    titleOf(issue.afterId),
                  )}
            </li>
          ))}
        </ul>
      ) : null}

      <ol className="grid gap-3">
        {beats.map((beat) => (
          <li key={beat.id} className="grid gap-2 rounded-lg border p-3">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{beat.title}</p>
                <p className="text-muted-foreground text-xs tabular-nums">
                  {formatSeconds(beat.startSec)} – {formatSeconds(beat.endSec)}
                </p>
              </div>
              {canEdit ? (
                <>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={en.common.editItem(beat.title)}
                    onClick={() => setEditing(beat)}
                  >
                    <Pencil />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={en.common.deleteItem(beat.title)}
                    disabled={remove.pending}
                    onClick={() => remove.run({ projectId, conceptId, beatId: beat.id })}
                  >
                    <Trash2 />
                  </Button>
                </>
              ) : null}
            </div>
            {beat.description ? (
              <p className="text-muted-foreground text-sm whitespace-pre-wrap">{beat.description}</p>
            ) : null}
            {beat.items.map((item) => (
              <div key={item.id} className="flex items-center gap-2 text-sm">
                <label className="flex min-w-0 flex-1 items-center gap-2">
                  <input
                    type="checkbox"
                    className="size-4"
                    checked={item.done}
                    disabled={!canEdit || toggleItem.pending}
                    onChange={(event) =>
                      toggleItem.run({
                        projectId,
                        conceptId,
                        itemId: item.id,
                        done: event.target.checked,
                      })
                    }
                  />
                  <span className={cn("truncate", item.done && "text-muted-foreground line-through")}>
                    {item.label}
                  </span>
                </label>
                {canEdit ? (
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground"
                    aria-label={en.common.deleteItem(item.label)}
                    onClick={() => removeItem.run({ projectId, conceptId, itemId: item.id })}
                  >
                    <X className="size-3.5" />
                  </button>
                ) : null}
              </div>
            ))}
            {canEdit ? (
              <Input
                placeholder={en.concepts.beats.addItem}
                aria-label={en.concepts.beats.addItemTo(beat.title)}
                className="h-8"
                maxLength={300}
                onKeyDown={(event) => {
                  const label = event.currentTarget.value.trim();
                  if (event.key !== "Enter" || !label) return;
                  addItem.run({ projectId, conceptId, beatId: beat.id, label });
                  event.currentTarget.value = "";
                }}
              />
            ) : null}
          </li>
        ))}
      </ol>

      {canEdit && beats.length > 0 ? (
        <div className="grid gap-1">
          <Button
            variant="outline"
            size="sm"
            disabled={toSegments.pending}
            onClick={() => toSegments.run({ projectId, conceptId })}
          >
            {en.concepts.beats.toSegments}
          </Button>
          <p className="text-muted-foreground text-xs">{en.concepts.beats.toSegmentsHint}</p>
        </div>
      ) : null}

      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <DialogContent>
          <form onSubmit={onSubmit} className="grid gap-4" key={current?.id ?? "new"}>
            <DialogHeader>
              <DialogTitle>{current ? en.concepts.beats.edit : en.concepts.beats.add}</DialogTitle>
            </DialogHeader>
            <FormField id="beat-title" label={en.concepts.beats.fields.title}>
              <Input id="beat-title" name="title" defaultValue={current?.title ?? ""} required />
            </FormField>
            <div className="grid grid-cols-2 gap-4">
              <FormField id="beat-start" label={en.concepts.beats.fields.start} hint={en.concepts.beats.timeHint}>
                <Input
                  id="beat-start"
                  name="start"
                  inputMode="numeric"
                  required
                  defaultValue={formatSeconds(current?.startSec ?? analysis.totalSec)}
                />
              </FormField>
              <FormField id="beat-end" label={en.concepts.beats.fields.end}>
                <Input
                  id="beat-end"
                  name="end"
                  inputMode="numeric"
                  required
                  defaultValue={formatSeconds(current?.endSec ?? analysis.totalSec + 10)}
                />
              </FormField>
            </div>
            <FormField id="beat-description" label={en.concepts.beats.fields.description}>
              <Textarea
                id="beat-description"
                name="description"
                rows={3}
                defaultValue={current?.description ?? ""}
              />
            </FormField>
            <FormError message={timeError ?? save.error} />
            <DialogFooter>
              <Button type="submit" disabled={save.pending}>
                {save.pending ? en.common.saving : en.common.save}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </aside>
  );
}
