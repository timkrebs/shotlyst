"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { ConfirmButton } from "@/components/confirm-button";
import { FormError, FormField } from "@/components/form-field";
import { NativeSelect } from "@/components/native-select";
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
import { ASPECT_RATIOS } from "@/features/projects/schema";
import { useAction } from "@/hooks/use-action";
import { en } from "@/messages/en";

import { deleteCreative, saveCreative } from "../actions";
import type { Creative } from "../queries";
import { CREATIVE_STATUSES } from "../schema";

type Status = (typeof CREATIVE_STATUSES)[number];
type Ratio = (typeof ASPECT_RATIOS)[number];

// Switches between the project's creatives (spots or cutdowns) and edits
// their brief: goal, key message, audience, must-haves, no-gos.
export function CreativeBar({
  projectId,
  creatives,
  current,
  projectAspectRatio,
  canEdit,
}: {
  projectId: string;
  creatives: Creative[];
  current: Creative;
  projectAspectRatio: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<Creative | "new" | null>(null);
  const save = useAction(saveCreative, {
    inlineError: true,
    successMessage: en.common.saved,
    onSuccess: () => setEditing(null),
  });
  const remove = useAction(deleteCreative);
  const creative = editing && editing !== "new" ? editing : null;
  const labels = en.shots.creative;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (key: string) => String(form.get(key) ?? "");
    save.run({
      projectId,
      creativeId: creative?.id ?? null,
      title: text("title"),
      status: text("status") as Status,
      goal: text("goal"),
      keyMessage: text("keyMessage"),
      audience: text("audience"),
      mustHaves: text("mustHaves"),
      noGos: text("noGos"),
      aspectRatio: (text("aspectRatio") || null) as Ratio | null,
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      <NativeSelect
        aria-label={labels.label}
        className="w-56"
        value={current.id}
        onChange={(event) =>
          router.push(`/projects/${projectId}/shotlist?creative=${event.target.value}`)
        }
      >
        {creatives.map((item) => (
          <option key={item.id} value={item.id}>
            {item.title}
          </option>
        ))}
      </NativeSelect>
      <Button variant="outline" size="sm" onClick={() => setEditing(current)}>
        {canEdit ? labels.edit : labels.view}
      </Button>
      {canEdit ? (
        <>
          <Button variant="outline" size="sm" onClick={() => setEditing("new")}>
            {labels.add}
          </Button>
          {creatives.length > 1 ? (
            <ConfirmButton
              variant="ghost"
              title={labels.deleteTitle(current.title)}
              description={labels.deleteDescription}
              confirmLabel={en.common.delete}
              pending={remove.pending}
              onConfirm={() => remove.run({ projectId, creativeId: current.id })}
            >
              {en.common.delete}
            </ConfirmButton>
          ) : null}
        </>
      ) : null}

      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
          <form onSubmit={onSubmit} className="grid gap-4" key={creative?.id ?? "new"}>
            <DialogHeader>
              <DialogTitle>{creative ? creative.title : labels.add}</DialogTitle>
            </DialogHeader>
            <fieldset disabled={!canEdit} className="grid gap-4">
              <FormField id="creative-title" label={labels.fields.title}>
                <Input id="creative-title" name="title" defaultValue={creative?.title ?? ""} required />
              </FormField>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField id="creative-status" label={labels.fields.status}>
                  <NativeSelect id="creative-status" name="status" defaultValue={creative?.status ?? "draft"}>
                    {CREATIVE_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {labels.status[status]}
                      </option>
                    ))}
                  </NativeSelect>
                </FormField>
                <FormField id="creative-aspect" label={labels.fields.aspectRatio}>
                  <NativeSelect
                    id="creative-aspect"
                    name="aspectRatio"
                    defaultValue={creative?.aspect_ratio ?? ""}
                  >
                    <option value="">{labels.projectRatio(projectAspectRatio)}</option>
                    {ASPECT_RATIOS.map((ratio) => (
                      <option key={ratio} value={ratio}>
                        {ratio}
                      </option>
                    ))}
                  </NativeSelect>
                </FormField>
              </div>
              {(
                [
                  ["goal", labels.fields.goal, creative?.goal],
                  ["keyMessage", labels.fields.keyMessage, creative?.key_message],
                  ["audience", labels.fields.audience, creative?.audience],
                  ["mustHaves", labels.fields.mustHaves, creative?.must_haves],
                  ["noGos", labels.fields.noGos, creative?.no_gos],
                ] as const
              ).map(([name, label, value]) => (
                <FormField key={name} id={`creative-${name}`} label={label}>
                  <Textarea id={`creative-${name}`} name={name} rows={2} defaultValue={value ?? ""} />
                </FormField>
              ))}
            </fieldset>
            <FormError message={save.error} />
            {canEdit ? (
              <DialogFooter>
                <Button type="submit" disabled={save.pending}>
                  {save.pending ? en.common.saving : en.common.save}
                </Button>
              </DialogFooter>
            ) : null}
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
