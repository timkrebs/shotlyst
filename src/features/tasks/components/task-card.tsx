import { CalendarDays, ListChecks } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { UserAvatar } from "@/components/user-avatar";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { en } from "@/messages/en";

import type { TaskItem } from "../queries";

export interface TaskMember {
  id: string;
  displayName: string;
  color: string;
}

// The face of a task on the board. Purely presentational, so the drag
// overlay can render it too.
export function TaskCard({
  task,
  assignee,
  subtasks,
  now,
  className,
}: {
  task: TaskItem;
  assignee: TaskMember | undefined;
  subtasks: TaskItem[];
  now: string;
  className?: string;
}) {
  const overdue = task.dueAt !== null && task.completedAt === null && task.dueAt < now;
  const done = subtasks.filter((subtask) => subtask.completedAt !== null).length;

  return (
    <div className={cn("bg-card grid gap-2 rounded-md border p-3 text-left shadow-xs", className)}>
      <p className={cn("text-sm font-medium", task.completedAt && "text-muted-foreground line-through")}>
        {task.title}
      </p>
      {task.labels.length > 0 || task.priority !== "normal" ? (
        <div className="flex flex-wrap gap-1">
          {task.priority !== "normal" ? (
            <Badge variant={task.priority === "low" ? "outline" : "destructive"}>
              {en.tasks.priority[task.priority as keyof typeof en.tasks.priority]}
            </Badge>
          ) : null}
          {task.labels.map((label) => (
            <Badge key={label} variant="secondary">
              {label}
            </Badge>
          ))}
        </div>
      ) : null}
      <div className="text-muted-foreground flex items-center gap-3 text-xs">
        {task.dueAt ? (
          <span className={cn("flex items-center gap-1", overdue && "text-destructive font-medium")}>
            <CalendarDays className="size-3.5" aria-hidden />
            {formatDate(task.dueAt)}
          </span>
        ) : null}
        {subtasks.length > 0 ? (
          <span className="flex items-center gap-1">
            <ListChecks className="size-3.5" aria-hidden />
            {done}/{subtasks.length}
          </span>
        ) : null}
        {assignee ? (
          <UserAvatar
            name={assignee.displayName}
            color={assignee.color}
            className="ml-auto size-6"
          />
        ) : null}
      </div>
    </div>
  );
}
