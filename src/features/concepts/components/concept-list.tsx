"use client";

import { FileText, Folder, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent } from "react";

import { ConfirmDialog } from "@/components/confirm-button";
import { FormError, FormField } from "@/components/form-field";
import { NativeSelect } from "@/components/native-select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAction } from "@/hooks/use-action";
import { formatDate } from "@/lib/format";
import { usePermissions } from "@/lib/permissions/use-permissions";
import { en } from "@/messages/en";

import {
  createConcept,
  deleteConcept,
  deleteConceptFolder,
  saveConceptFolder,
  setActiveConcept,
} from "../actions";
import type { ConceptFolder, ConceptListItem } from "../queries";
import { CONCEPT_TYPES } from "../schema";

type ConceptType = (typeof CONCEPT_TYPES)[number];

export function ConceptList({
  projectId,
  concepts,
  folders,
}: {
  projectId: string;
  concepts: ConceptListItem[];
  folders: ConceptFolder[];
}) {
  const { canEdit } = usePermissions(projectId);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<ConceptListItem | null>(null);
  const create = useAction(createConcept, { inlineError: true });
  const activate = useAction(setActiveConcept, { successMessage: en.concepts.activated });
  const remove = useAction(deleteConcept, { successMessage: en.common.deleted });
  const saveFolder = useAction(saveConceptFolder);
  const removeFolder = useAction(deleteConceptFolder);

  function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    create.run({
      projectId,
      title: String(form.get("title") ?? ""),
      type: String(form.get("type") ?? "treatment") as ConceptType,
      folderId: String(form.get("folderId") ?? "") || null,
    });
  }

  function onNewFolder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = event.currentTarget.elements.namedItem("name") as HTMLInputElement;
    if (!input.value.trim()) return;
    saveFolder.run({ projectId, folderId: null, name: input.value });
    input.value = "";
  }

  const groups: { folder: ConceptFolder | null; items: ConceptListItem[] }[] = [
    { folder: null, items: concepts.filter((concept) => concept.folder_id === null) },
    ...folders.map((folder) => ({
      folder,
      items: concepts.filter((concept) => concept.folder_id === folder.id),
    })),
  ];

  return (
    <div className="grid gap-6">
      {canEdit ? (
        <div className="flex flex-wrap items-center gap-2">
          <Dialog>
            <DialogTrigger asChild>
              <Button size="sm">{en.concepts.new}</Button>
            </DialogTrigger>
            <DialogContent>
              <form onSubmit={onCreate} className="grid gap-4">
                <DialogHeader>
                  <DialogTitle>{en.concepts.new}</DialogTitle>
                </DialogHeader>
                <FormField id="concept-title" label={en.concepts.fields.title}>
                  <Input id="concept-title" name="title" required />
                </FormField>
                <FormField id="concept-type" label={en.concepts.fields.type}>
                  <NativeSelect id="concept-type" name="type" defaultValue="treatment">
                    {CONCEPT_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {en.concepts.type[type]}
                      </option>
                    ))}
                  </NativeSelect>
                </FormField>
                <FormField id="concept-folder" label={en.concepts.fields.folder}>
                  <NativeSelect id="concept-folder" name="folderId" defaultValue="">
                    <option value="">{en.concepts.noFolder}</option>
                    {folders.map((folder) => (
                      <option key={folder.id} value={folder.id}>
                        {folder.name}
                      </option>
                    ))}
                  </NativeSelect>
                </FormField>
                <FormError message={create.error} />
                <DialogFooter>
                  <Button type="submit" disabled={create.pending}>
                    {en.concepts.create}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
          <form onSubmit={onNewFolder} className="ml-auto flex gap-2">
            <Input
              name="name"
              placeholder={en.concepts.newFolder}
              aria-label={en.concepts.newFolder}
              className="h-8 w-44"
              maxLength={120}
            />
            <Button type="submit" variant="outline" size="sm" disabled={saveFolder.pending}>
              {en.common.add}
            </Button>
          </form>
        </div>
      ) : null}

      {groups.map(({ folder, items }) =>
        folder === null && items.length === 0 ? null : (
          <section key={folder?.id ?? "root"} className="grid gap-2">
            {folder ? (
              <div className="flex items-center gap-2">
                <Folder className="text-muted-foreground size-4" aria-hidden />
                {renaming === folder.id ? (
                  <Input
                    autoFocus
                    defaultValue={folder.name}
                    aria-label={en.concepts.folderName}
                    className="h-7 w-56"
                    maxLength={120}
                    onBlur={(event) => {
                      setRenaming(null);
                      const name = event.target.value.trim();
                      if (name && name !== folder.name) {
                        saveFolder.run({ projectId, folderId: folder.id, name });
                      }
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") event.currentTarget.blur();
                      if (event.key === "Escape") setRenaming(null);
                    }}
                  />
                ) : canEdit ? (
                  <button
                    type="button"
                    className="text-sm font-semibold hover:underline"
                    title={en.concepts.renameFolder}
                    onClick={() => setRenaming(folder.id)}
                  >
                    {folder.name}
                  </button>
                ) : (
                  <h2 className="text-sm font-semibold">{folder.name}</h2>
                )}
                {canEdit ? (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={en.common.deleteItem(folder.name)}
                    disabled={removeFolder.pending}
                    onClick={() => removeFolder.run({ projectId, folderId: folder.id })}
                  >
                    <Trash2 />
                  </Button>
                ) : null}
              </div>
            ) : null}
            {items.length === 0 ? (
              <p className="text-muted-foreground text-sm">{en.concepts.emptyFolder}</p>
            ) : (
              <ul className="divide-y rounded-lg border">
                {items.map((concept) => (
                  <li key={concept.id} className="flex flex-wrap items-center gap-3 p-3">
                    <FileText className="text-muted-foreground size-4" aria-hidden />
                    <Link
                      href={`/projects/${projectId}/concepts/${concept.id}`}
                      className="min-w-0 flex-1 truncate font-medium hover:underline"
                    >
                      {concept.title}
                    </Link>
                    {concept.is_active ? <Badge>{en.concepts.active}</Badge> : null}
                    <Badge variant="outline">
                      {en.concepts.type[concept.type as ConceptType] ?? concept.type}
                    </Badge>
                    <span className="text-muted-foreground text-xs">
                      {formatDate(concept.updated_at)}
                    </span>
                    {canEdit && !concept.is_active ? (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={activate.pending}
                          onClick={() => activate.run({ projectId, conceptId: concept.id })}
                        >
                          {en.concepts.setActive}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={en.common.deleteItem(concept.title)}
                          onClick={() => setDeleting(concept)}
                        >
                          <Trash2 />
                        </Button>
                      </>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        ),
      )}

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title={en.concepts.deleteTitle(deleting?.title ?? "")}
        description={en.concepts.deleteDescription}
        confirmLabel={en.common.delete}
        pending={remove.pending}
        onConfirm={() => {
          if (deleting) remove.run({ projectId, conceptId: deleting.id });
          setDeleting(null);
        }}
      />
    </div>
  );
}
