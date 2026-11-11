"use client";

import { Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";

import { FormError, FormField } from "@/components/form-field";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAction } from "@/hooks/use-action";
import type { ShotColumn } from "@/lib/shots/columns";
import type { CustomColumn } from "@/lib/shots/types";
import { en } from "@/messages/en";

import { deleteCustomColumn, saveCustomColumn, setColumnVisible } from "../actions";
import { CUSTOM_COLUMN_TYPES } from "../schema";

type ColumnType = (typeof CUSTOM_COLUMN_TYPES)[number];

// Shows and hides columns and manages the project's custom columns. The
// choice applies to everyone in the project and to the exports.
export function ColumnsDialog({
  projectId,
  columns,
  custom,
}: {
  projectId: string;
  columns: (ShotColumn & { visible: boolean })[];
  custom: CustomColumn[];
}) {
  const [type, setType] = useState<ColumnType>("text");
  const visibility = useAction(setColumnVisible);
  const save = useAction(saveCustomColumn, { inlineError: true });
  const remove = useAction(deleteCustomColumn);
  const labels = en.shots.columns;
  const customByKey = new Map(custom.map((column) => [column.key, column]));

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    save.run({
      projectId,
      columnId: null,
      label: String(form.get("label") ?? ""),
      type,
      options: String(form.get("options") ?? "")
        .split(",")
        .map((option) => option.trim())
        .filter(Boolean),
    });
    event.currentTarget.reset();
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          {labels.button}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{labels.title}</DialogTitle>
          <DialogDescription>{labels.description}</DialogDescription>
        </DialogHeader>
        <ul className="grid gap-1 sm:grid-cols-2">
          {columns.map((column) => {
            const own = customByKey.get(column.key);
            return (
              <li key={column.key} className="flex items-center gap-2 text-sm">
                <label className="flex min-w-0 flex-1 items-center gap-2 py-1">
                  <input
                    type="checkbox"
                    className="size-4"
                    checked={column.visible}
                    disabled={visibility.pending}
                    onChange={(event) =>
                      visibility.run({ projectId, key: column.key, visible: event.target.checked })
                    }
                  />
                  <span className="truncate">{column.label}</span>
                </label>
                {own ? (
                  <button
                    type="button"
                    aria-label={en.common.deleteItem(column.label)}
                    className="text-muted-foreground hover:text-foreground"
                    disabled={remove.pending}
                    onClick={() => remove.run({ projectId, columnId: own.id })}
                  >
                    <Trash2 className="size-4" />
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
        <form onSubmit={onSubmit} className="grid gap-3 border-t pt-4">
          <p className="text-sm font-medium">{labels.addCustom}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField id="column-label" label={labels.fields.label}>
              <Input id="column-label" name="label" required maxLength={60} />
            </FormField>
            <FormField id="column-type" label={labels.fields.type}>
              <NativeSelect
                id="column-type"
                value={type}
                onChange={(event) => setType(event.target.value as ColumnType)}
              >
                {CUSTOM_COLUMN_TYPES.map((value) => (
                  <option key={value} value={value}>
                    {labels.types[value]}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
          </div>
          {type === "select" ? (
            <FormField id="column-options" label={labels.fields.options} hint={labels.optionsHint}>
              <Input id="column-options" name="options" required />
            </FormField>
          ) : null}
          <FormError message={save.error} />
          <div>
            <Button type="submit" size="sm" disabled={save.pending}>
              {labels.add}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
