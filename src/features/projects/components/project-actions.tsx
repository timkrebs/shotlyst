"use client";

import { useState, type FormEvent } from "react";

import { ConfirmButton } from "@/components/confirm-button";
import { FormError, FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAction } from "@/hooks/use-action";
import { usePermissions } from "@/lib/permissions/use-permissions";
import { en } from "@/messages/en";

import { deleteProject, duplicateProject, setProjectArchived } from "../actions";

// Copies the project's structure and shots into a new project. Open to
// everyone who can read the project.
export function DuplicateProjectDialog({
  projectId,
  name,
  suggestedNumber,
}: {
  projectId: string;
  name: string;
  suggestedNumber: string;
}) {
  const [open, setOpen] = useState(false);
  const duplicate = useAction(duplicateProject, { inlineError: true });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    duplicate.run({
      projectId,
      name: String(form.get("name") ?? ""),
      projectNumber: String(form.get("projectNumber") ?? ""),
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          {en.projects.duplicate}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={onSubmit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{en.projects.duplicateTitle}</DialogTitle>
            <DialogDescription>{en.projects.duplicateDescription}</DialogDescription>
          </DialogHeader>
          <FormField id="duplicate-name" label={en.projects.fields.name}>
            <Input id="duplicate-name" name="name" defaultValue={en.projects.copyOf(name)} required />
          </FormField>
          <FormField id="duplicate-number" label={en.projects.fields.number}>
            <Input id="duplicate-number" name="projectNumber" defaultValue={suggestedNumber} required />
          </FormField>
          <FormError message={duplicate.error} />
          <DialogFooter>
            <Button type="submit" disabled={duplicate.pending}>
              {en.projects.duplicate}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ProjectActions({
  projectId,
  name,
  archived,
}: {
  projectId: string;
  name: string;
  archived: boolean;
}) {
  const { canEdit } = usePermissions(projectId);
  const archive = useAction(setProjectArchived, { successMessage: en.common.saved });
  const remove = useAction(deleteProject);
  if (!canEdit) return null;

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        disabled={archive.pending}
        onClick={() => archive.run({ projectId, archived: !archived })}
      >
        {archived ? en.projects.unarchive : en.projects.archive}
      </Button>
      <ConfirmButton
        title={en.projects.deleteTitle(name)}
        description={en.projects.deleteDescription}
        confirmLabel={en.projects.delete}
        pending={remove.pending}
        onConfirm={() => remove.run({ projectId })}
      >
        {en.projects.delete}
      </ConfirmButton>
    </>
  );
}
