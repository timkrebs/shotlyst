"use client";

import { Pencil, Trash2 } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";

import { ConfirmDialog } from "@/components/confirm-button";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useAction } from "@/hooks/use-action";
import type { ActionResult } from "@/lib/action-types";
import { en } from "@/messages/en";

export interface LibraryField<K extends string> {
  key: K;
  label: string;
  type: "text" | "textarea" | "email" | "url" | "tel";
  required?: boolean;
  // Shown as a table column.
  column?: boolean;
}

export interface LibraryItem<K extends string> {
  id: string;
  createdBy: string | null;
  values: Record<K, string>;
}

// One searchable table with a create and edit dialog, shared by the simple
// library lists (brands, clients).
export function LibraryTable<K extends string>({
  labels,
  fields,
  items,
  currentUserId,
  isAdmin,
  onSave,
  onDelete,
}: {
  labels: { add: string; edit: string; empty: string; deleteTitle: (name: string) => string };
  fields: LibraryField<K>[];
  items: LibraryItem<K>[];
  currentUserId: string;
  isAdmin: boolean;
  onSave: (input: { id: string | null; values: Record<K, string> }) => Promise<ActionResult>;
  onDelete: (input: { id: string }) => Promise<ActionResult>;
}) {
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<LibraryItem<K> | "new" | null>(null);
  const [deleting, setDeleting] = useState<LibraryItem<K> | null>(null);
  const save = useAction(onSave, {
    inlineError: true,
    successMessage: en.common.saved,
    onSuccess: () => setEditing(null),
  });
  const remove = useAction(onDelete, { successMessage: en.common.deleted });

  const columns = fields.filter((field) => field.column);
  const nameKey = fields[0].key;
  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((item) =>
      fields.some((field) => item.values[field.key].toLowerCase().includes(needle)),
    );
  }, [fields, items, search]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const values = Object.fromEntries(
      fields.map((field) => [field.key, String(form.get(field.key) ?? "")]),
    ) as Record<K, string>;
    save.run({ id: editing && editing !== "new" ? editing.id : null, values });
  }

  const current = editing && editing !== "new" ? editing : null;

  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-2">
        <Input
          type="search"
          placeholder={en.common.search}
          aria-label={en.common.search}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="max-w-xs"
        />
        <Button size="sm" className="ml-auto" onClick={() => setEditing("new")}>
          {labels.add}
        </Button>
      </div>
      {visible.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {items.length === 0 ? labels.empty : en.common.noResults}
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((field) => (
                <TableHead key={field.key}>{field.label}</TableHead>
              ))}
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((item) => (
              <TableRow key={item.id}>
                {columns.map((field, index) => (
                  <TableCell
                    key={field.key}
                    className={index === 0 ? "font-medium" : "text-muted-foreground"}
                  >
                    {item.values[field.key] || "–"}
                  </TableCell>
                ))}
                <TableCell>
                  <div className="flex justify-end">
                    {isAdmin || item.createdBy === currentUserId ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={en.common.editItem(item.values[nameKey])}
                        onClick={() => setEditing(item)}
                      >
                        <Pencil />
                      </Button>
                    ) : null}
                    {isAdmin ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={en.common.deleteItem(item.values[nameKey])}
                        onClick={() => setDeleting(item)}
                      >
                        <Trash2 />
                      </Button>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <form onSubmit={onSubmit} className="grid gap-4" key={current?.id ?? "new"}>
            <DialogHeader>
              <DialogTitle>{current ? labels.edit : labels.add}</DialogTitle>
            </DialogHeader>
            {fields.map((field) => {
              const id = `library-${field.key}`;
              return (
                <FormField key={field.key} id={id} label={field.label}>
                  {field.type === "textarea" ? (
                    <Textarea
                      id={id}
                      name={field.key}
                      rows={3}
                      defaultValue={current?.values[field.key] ?? ""}
                    />
                  ) : (
                    <Input
                      id={id}
                      name={field.key}
                      type={field.type}
                      required={field.required}
                      defaultValue={current?.values[field.key] ?? ""}
                    />
                  )}
                </FormField>
              );
            })}
            <FormError message={save.error} />
            <DialogFooter>
              <Button type="submit" disabled={save.pending}>
                {save.pending ? en.common.saving : en.common.save}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title={labels.deleteTitle(deleting?.values[nameKey] ?? "")}
        description={en.library.deleteDescription}
        confirmLabel={en.common.delete}
        pending={remove.pending}
        onConfirm={() => {
          if (deleting) remove.run({ id: deleting.id });
          setDeleting(null);
        }}
      />
    </div>
  );
}
