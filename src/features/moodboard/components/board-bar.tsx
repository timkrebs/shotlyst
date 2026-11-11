"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { ConfirmButton } from "@/components/confirm-button";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAction } from "@/hooks/use-action";
import { usePermissions } from "@/lib/permissions/use-permissions";
import { en } from "@/messages/en";

import { createBoard, deleteBoard, renameBoard } from "../actions";
import type { Board } from "../queries";

// Switches between the project's boards; editors add, rename and delete them.
export function BoardBar({
  projectId,
  boards,
  current,
}: {
  projectId: string;
  boards: Board[];
  current: Board;
}) {
  const router = useRouter();
  const { canEdit } = usePermissions(projectId);
  const [renaming, setRenaming] = useState(false);
  const create = useAction(createBoard);
  const rename = useAction(renameBoard, { onSuccess: () => setRenaming(false) });
  const remove = useAction(deleteBoard);

  function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = event.currentTarget.elements.namedItem("title") as HTMLInputElement;
    if (!input.value.trim()) return;
    create.run({ projectId, title: input.value });
    input.value = "";
  }

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      {renaming ? (
        <Input
          autoFocus
          defaultValue={current.title}
          aria-label={en.moodboard.boardName}
          className="h-9 w-56"
          maxLength={120}
          onBlur={(event) => {
            const title = event.target.value.trim();
            if (title && title !== current.title) {
              rename.run({ projectId, boardId: current.id, title });
            } else {
              setRenaming(false);
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") setRenaming(false);
          }}
        />
      ) : (
        <NativeSelect
          aria-label={en.moodboard.board}
          className="w-56"
          value={current.id}
          onChange={(event) =>
            router.push(`/projects/${projectId}/moodboard?board=${event.target.value}`)
          }
        >
          {boards.map((board) => (
            <option key={board.id} value={board.id}>
              {board.title}
            </option>
          ))}
        </NativeSelect>
      )}
      {canEdit ? (
        <>
          <Button variant="outline" size="sm" onClick={() => setRenaming(true)}>
            {en.moodboard.rename}
          </Button>
          {boards.length > 1 ? (
            <ConfirmButton
              variant="ghost"
              title={en.moodboard.deleteTitle(current.title)}
              description={en.moodboard.deleteDescription}
              confirmLabel={en.common.delete}
              pending={remove.pending}
              onConfirm={() => remove.run({ projectId, boardId: current.id })}
            >
              {en.common.delete}
            </ConfirmButton>
          ) : null}
          <form onSubmit={onCreate} className="ml-auto flex gap-2">
            <Input
              name="title"
              placeholder={en.moodboard.newBoard}
              aria-label={en.moodboard.newBoard}
              className="h-8 w-44"
              maxLength={120}
            />
            <Button type="submit" variant="outline" size="sm" disabled={create.pending}>
              {en.common.add}
            </Button>
          </form>
        </>
      ) : null}
    </div>
  );
}
