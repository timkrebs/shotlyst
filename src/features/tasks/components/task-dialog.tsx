"use client";

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
import { useAction } from "@/hooks/use-action";
import { positionAfter } from "@/lib/position";
import { en } from "@/messages/en";

import {
  createTask,
  deleteTask,
  moveTask,
  setTaskCompleted,
  updateTask,
} from "../actions";
import type { TaskItem, TaskSection } from "../queries";
import { TASK_PRIORITIES, type TaskPriority } from "../schema";
import type { TaskMember } from "./task-card";

// Details of one task. Editors change everything; other roles read, and the
// assignee can tick the task off.
export function TaskDialog({
  projectId,
  task,
  subtasks,
  sections,
  sectionTasks,
  members,
  canEdit,
  canComplete,
  onClose,
}: {
  projectId: string;
  task: TaskItem;
  subtasks: TaskItem[];
  sections: TaskSection[];
  // Positions already used per column, to append when the column changes.
  sectionTasks: (sectionId: string) => TaskItem[];
  members: TaskMember[];
  canEdit: boolean;
  canComplete: boolean;
  onClose: () => void;
}) {
  const [subtaskTitle, setSubtaskTitle] = useState("");
  const save = useAction(updateTask, {
    inlineError: true,
    successMessage: en.common.saved,
    onSuccess: onClose,
  });
  const move = useAction(moveTask);
  const complete = useAction(setTaskCompleted);
  const addSubtask = useAction(createTask, { onSuccess: () => setSubtaskTitle("") });
  const remove = useAction(deleteTask, { successMessage: en.common.deleted, onSuccess: onClose });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (key: string) => String(form.get(key) ?? "");
    save.run({
      projectId,
      taskId: task.id,
      title: text("title"),
      description: text("description"),
      assigneeId: text("assigneeId") || null,
      priority: text("priority") as TaskPriority,
      labels: text("labels")
        .split(",")
        .map((label) => label.trim())
        .filter(Boolean),
      dueDate: text("dueDate") || null,
    });
  }

  function onSectionChange(sectionId: string) {
    const last = sectionTasks(sectionId).at(-1)?.position ?? null;
    move.run({ projectId, taskId: task.id, sectionId, position: positionAfter(last) });
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <form onSubmit={onSubmit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{canEdit ? en.tasks.editTitle : task.title}</DialogTitle>
          </DialogHeader>
          <fieldset disabled={!canEdit} className="grid gap-4">
            <FormField id="task-title" label={en.tasks.fields.title}>
              <Input id="task-title" name="title" defaultValue={task.title} required />
            </FormField>
            <FormField id="task-description" label={en.tasks.fields.description}>
              <Textarea
                id="task-description"
                name="description"
                rows={3}
                defaultValue={task.description ?? ""}
              />
            </FormField>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField id="task-section" label={en.tasks.fields.column}>
                <NativeSelect
                  id="task-section"
                  value={task.sectionId}
                  disabled={move.pending}
                  onChange={(event) => onSectionChange(event.target.value)}
                >
                  {sections.map((section) => (
                    <option key={section.id} value={section.id}>
                      {section.name}
                    </option>
                  ))}
                </NativeSelect>
              </FormField>
              <FormField id="task-assignee" label={en.tasks.fields.assignee}>
                <NativeSelect id="task-assignee" name="assigneeId" defaultValue={task.assigneeId ?? ""}>
                  <option value="">{en.tasks.unassigned}</option>
                  {members.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.displayName}
                    </option>
                  ))}
                </NativeSelect>
              </FormField>
              <FormField id="task-priority" label={en.tasks.fields.priority}>
                <NativeSelect id="task-priority" name="priority" defaultValue={task.priority}>
                  {TASK_PRIORITIES.map((priority) => (
                    <option key={priority} value={priority}>
                      {en.tasks.priority[priority]}
                    </option>
                  ))}
                </NativeSelect>
              </FormField>
              <FormField id="task-due" label={en.tasks.fields.due}>
                <Input
                  id="task-due"
                  name="dueDate"
                  type="date"
                  defaultValue={task.dueAt ? task.dueAt.slice(0, 10) : ""}
                />
              </FormField>
            </div>
            <FormField id="task-labels" label={en.tasks.fields.labels} hint={en.tasks.fields.labelsHint}>
              <Input id="task-labels" name="labels" defaultValue={task.labels.join(", ")} />
            </FormField>
          </fieldset>

          {task.parentTaskId === null ? (
            <div className="grid gap-2">
              <p className="text-sm font-medium">{en.tasks.subtasks}</p>
              {subtasks.map((subtask) => (
                <label key={subtask.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-4"
                    checked={subtask.completedAt !== null}
                    disabled={!canEdit || complete.pending}
                    onChange={(event) =>
                      complete.run({
                        projectId,
                        taskId: subtask.id,
                        completed: event.target.checked,
                      })
                    }
                  />
                  <span className={subtask.completedAt ? "text-muted-foreground line-through" : ""}>
                    {subtask.title}
                  </span>
                </label>
              ))}
              {canEdit ? (
                <div className="flex gap-2">
                  <Input
                    value={subtaskTitle}
                    onChange={(event) => setSubtaskTitle(event.target.value)}
                    placeholder={en.tasks.addSubtask}
                    aria-label={en.tasks.addSubtask}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter") return;
                      event.preventDefault();
                      if (!subtaskTitle.trim()) return;
                      addSubtask.run({
                        projectId,
                        sectionId: sections.find((section) => !section.isDone)?.id ?? task.sectionId,
                        parentTaskId: task.id,
                        title: subtaskTitle,
                      });
                    }}
                  />
                </div>
              ) : null}
            </div>
          ) : null}

          <FormError message={save.error} />
          <DialogFooter className="sm:justify-between">
            <div className="flex gap-2">
              {canEdit ? (
                <ConfirmButton
                  variant="ghost"
                  title={en.tasks.deleteTitle(task.title)}
                  description={en.tasks.deleteDescription}
                  confirmLabel={en.common.delete}
                  pending={remove.pending}
                  onConfirm={() => remove.run({ projectId, taskId: task.id })}
                >
                  {en.common.delete}
                </ConfirmButton>
              ) : null}
              {canComplete ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={complete.pending}
                  onClick={() =>
                    complete.run({
                      projectId,
                      taskId: task.id,
                      completed: task.completedAt === null,
                    })
                  }
                >
                  {task.completedAt === null ? en.tasks.markDone : en.tasks.reopen}
                </Button>
              ) : null}
            </div>
            {canEdit ? (
              <Button type="submit" disabled={save.pending}>
                {save.pending ? en.common.saving : en.common.save}
              </Button>
            ) : null}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
