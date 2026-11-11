"use client";

import { ConfirmButton } from "@/components/confirm-button";
import { Button } from "@/components/ui/button";
import { useAction } from "@/hooks/use-action";
import { usePermissions } from "@/lib/permissions/use-permissions";
import { en } from "@/messages/en";

import { deleteProject, setProjectArchived } from "../actions";

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
