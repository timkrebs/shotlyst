"use client";

import type { FormEvent } from "react";

import { FormError } from "@/components/form-field";
import { NativeSelect } from "@/components/native-select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAction } from "@/hooks/use-action";
import { en } from "@/messages/en";

import { setActiveConcept, updateConcept } from "../actions";
import type { ConceptFolder } from "../queries";
import { CONCEPT_STATUSES, CONCEPT_TYPES } from "../schema";

type ConceptType = (typeof CONCEPT_TYPES)[number];
type ConceptStatus = (typeof CONCEPT_STATUSES)[number];

export function ConceptHeader({
  projectId,
  concept,
  folders,
  canEdit,
}: {
  projectId: string;
  concept: {
    id: string;
    title: string;
    type: string;
    status: string;
    is_active: boolean;
    folder_id: string | null;
  };
  folders: ConceptFolder[];
  canEdit: boolean;
}) {
  const save = useAction(updateConcept, { inlineError: true, successMessage: en.common.saved });
  const activate = useAction(setActiveConcept, { successMessage: en.concepts.activated });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    save.run({
      projectId,
      conceptId: concept.id,
      title: String(form.get("title") ?? ""),
      type: String(form.get("type") ?? "") as ConceptType,
      status: String(form.get("status") ?? "") as ConceptStatus,
      folderId: String(form.get("folderId") ?? "") || null,
    });
  }

  if (!canEdit) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-semibold">{concept.title}</h1>
        {concept.is_active ? <Badge>{en.concepts.active}</Badge> : null}
        <Badge variant="outline">{en.concepts.type[concept.type as ConceptType] ?? concept.type}</Badge>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          name="title"
          aria-label={en.concepts.fields.title}
          defaultValue={concept.title}
          required
          className="h-9 max-w-md flex-1 font-medium"
        />
        <NativeSelect
          name="type"
          aria-label={en.concepts.fields.type}
          defaultValue={concept.type}
          className="w-32"
        >
          {CONCEPT_TYPES.map((type) => (
            <option key={type} value={type}>
              {en.concepts.type[type]}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          name="status"
          aria-label={en.concepts.fields.status}
          defaultValue={concept.status}
          className="w-28"
        >
          {CONCEPT_STATUSES.map((status) => (
            <option key={status} value={status}>
              {en.concepts.status[status]}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          name="folderId"
          aria-label={en.concepts.fields.folder}
          defaultValue={concept.folder_id ?? ""}
          className="w-40"
        >
          <option value="">{en.concepts.noFolder}</option>
          {folders.map((folder) => (
            <option key={folder.id} value={folder.id}>
              {folder.name}
            </option>
          ))}
        </NativeSelect>
        <Button type="submit" variant="outline" size="sm" disabled={save.pending}>
          {en.common.save}
        </Button>
        {concept.is_active ? (
          <Badge>{en.concepts.active}</Badge>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={activate.pending}
            onClick={() => activate.run({ projectId, conceptId: concept.id })}
          >
            {en.concepts.setActive}
          </Button>
        )}
      </div>
      <FormError message={save.error} />
    </form>
  );
}
