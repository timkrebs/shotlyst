"use client";

import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDownUp } from "lucide-react";
import { useMemo, useOptimistic, useState, useTransition } from "react";
import { toast } from "sonner";

import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAction } from "@/hooks/use-action";
import { formatDate } from "@/lib/format";
import { usePermissions } from "@/lib/permissions/use-permissions";
import { comparePositions, positionAt } from "@/lib/position";
import { cn } from "@/lib/utils";
import { en } from "@/messages/en";

import { createTask, moveTask, renameTaskSection } from "../actions";
import type { TaskItem, TaskSection } from "../queries";
import { TaskCard, type TaskMember } from "./task-card";
import { TaskDialog } from "./task-dialog";

interface Move {
  taskId: string;
  sectionId: string;
  position: string;
}

const SECTION_PREFIX = "section:";

// The drop target is what lies under the pointer: a card if there is one,
// otherwise the column. Keyboard dragging has no pointer and falls back to
// the nearest corners.
const detectCollision: CollisionDetection = (args) => {
  const under = pointerWithin(args);
  if (under.length === 0) return closestCorners(args);
  const cards = under.filter((hit) => !String(hit.id).startsWith(SECTION_PREFIX));
  return cards.length > 0 ? cards : under;
};

export function TaskBoard({
  projectId,
  sections,
  tasks,
  members,
  currentUserId,
  now,
}: {
  projectId: string;
  sections: TaskSection[];
  tasks: TaskItem[];
  members: TaskMember[];
  currentUserId: string;
  // Request time from the server, so "overdue" renders the same everywhere.
  now: string;
}) {
  const { canEdit, canComment } = usePermissions(projectId);
  const [view, setView] = useState<"board" | "list">("board");
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // The card jumps to its new place at once; the server result replaces this
  // when the move has been saved.
  const [optimisticTasks, applyMove] = useOptimistic(tasks, (state, move: Move) => {
    const done = sections.find((section) => section.id === move.sectionId)?.isDone ?? false;
    return state
      .map((task) =>
        task.id === move.taskId
          ? {
              ...task,
              sectionId: move.sectionId,
              position: move.position,
              completedAt: done ? (task.completedAt ?? now) : null,
            }
          : task,
      )
      .sort((a, b) => comparePositions(a.position, b.position));
  });

  const memberById = useMemo(() => new Map(members.map((member) => [member.id, member])), [members]);
  const topLevel = optimisticTasks.filter((task) => task.parentTaskId === null);
  const subtasksOf = (taskId: string) =>
    optimisticTasks.filter((task) => task.parentTaskId === taskId);
  const inSection = (sectionId: string) => topLevel.filter((task) => task.sectionId === sectionId);
  const openTask = optimisticTasks.find((task) => task.id === openTaskId);
  const dragging = topLevel.find((task) => task.id === draggingId);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragEnd({ active, over }: DragEndEvent) {
    setDraggingId(null);
    if (!over) return;
    const task = topLevel.find((candidate) => candidate.id === active.id);
    if (!task) return;

    const overId = String(over.id);
    const overTask = topLevel.find((candidate) => candidate.id === overId);
    const sectionId = overId.startsWith(SECTION_PREFIX)
      ? overId.slice(SECTION_PREFIX.length)
      : overTask?.sectionId;
    if (!sectionId) return;

    const column = inSection(sectionId);
    const others = column.filter((candidate) => candidate.id !== task.id);
    let index = others.length;
    if (overTask && overTask.id !== task.id) {
      index = others.findIndex((candidate) => candidate.id === overTask.id);
      // Dragging downwards inside a column drops the card after its target.
      const from = column.findIndex((candidate) => candidate.id === task.id);
      const to = column.findIndex((candidate) => candidate.id === overTask.id);
      if (from !== -1 && from < to) index += 1;
    } else if (overTask) {
      return;
    }
    if (task.sectionId === sectionId && column.indexOf(task) === index) return;

    const move: Move = {
      taskId: task.id,
      sectionId,
      position: positionAt(
        others.map((candidate) => candidate.position),
        index,
      ),
    };
    startTransition(async () => {
      applyMove(move);
      const result = await moveTask({ projectId, ...move });
      if (!result.ok) toast.error(result.error);
    });
  }

  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-1">
        <Button
          variant={view === "board" ? "secondary" : "ghost"}
          size="sm"
          onClick={() => setView("board")}
        >
          {en.tasks.board}
        </Button>
        <Button
          variant={view === "list" ? "secondary" : "ghost"}
          size="sm"
          onClick={() => setView("list")}
        >
          {en.tasks.list}
        </Button>
      </div>

      {view === "board" ? (
        <DndContext
          sensors={sensors}
          collisionDetection={detectCollision}
          onDragStart={({ active }) => setDraggingId(String(active.id))}
          onDragCancel={() => setDraggingId(null)}
          onDragEnd={onDragEnd}
        >
          <div className="flex items-start gap-4 overflow-x-auto pb-2">
            {sections.map((section) => (
              <Column
                key={section.id}
                projectId={projectId}
                section={section}
                tasks={inSection(section.id)}
                canEdit={canEdit}
              >
                {inSection(section.id).map((task) => (
                  <SortableTask
                    key={task.id}
                    task={task}
                    disabled={!canEdit}
                    onOpen={() => setOpenTaskId(task.id)}
                  >
                    <TaskCard
                      task={task}
                      assignee={task.assigneeId ? memberById.get(task.assigneeId) : undefined}
                      subtasks={subtasksOf(task.id)}
                      now={now}
                    />
                  </SortableTask>
                ))}
              </Column>
            ))}
          </div>
          <DragOverlay>
            {dragging ? (
              <TaskCard
                task={dragging}
                assignee={dragging.assigneeId ? memberById.get(dragging.assigneeId) : undefined}
                subtasks={subtasksOf(dragging.id)}
                now={now}
                className="rotate-2 shadow-lg"
              />
            ) : null}
          </DragOverlay>
        </DndContext>
      ) : (
        <TaskList
          tasks={topLevel}
          sections={sections}
          members={members}
          now={now}
          onOpen={setOpenTaskId}
        />
      )}

      {openTask ? (
        <TaskDialog
          key={openTask.id}
          projectId={projectId}
          task={openTask}
          subtasks={subtasksOf(openTask.id)}
          sections={sections}
          sectionTasks={inSection}
          members={members}
          canEdit={canEdit}
          canComplete={canEdit || (canComment && openTask.assigneeId === currentUserId)}
          onClose={() => setOpenTaskId(null)}
        />
      ) : null}
    </div>
  );
}

function Column({
  projectId,
  section,
  tasks,
  canEdit,
  children,
}: {
  projectId: string;
  section: TaskSection;
  tasks: TaskItem[];
  canEdit: boolean;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `${SECTION_PREFIX}${section.id}` });
  const [title, setTitle] = useState("");
  const [renaming, setRenaming] = useState(false);
  const create = useAction(createTask, { onSuccess: () => setTitle("") });
  const rename = useAction(renameTaskSection);

  function commitName(name: string) {
    setRenaming(false);
    const trimmed = name.trim();
    if (trimmed && trimmed !== section.name) {
      rename.run({ projectId, sectionId: section.id, name: trimmed });
    }
  }

  return (
    <section
      ref={setNodeRef}
      aria-label={section.name}
      data-testid={`column-${section.name}`}
      className={cn(
        "bg-muted/50 flex max-w-96 min-w-56 flex-1 basis-0 flex-col gap-2 rounded-lg p-2",
        isOver && "ring-ring/50 ring-2",
      )}
    >
      <header className="flex items-center gap-2 px-1">
        <span className="size-2.5 rounded-full" style={{ backgroundColor: section.color }} />
        {renaming ? (
          <Input
            autoFocus
            defaultValue={section.name}
            aria-label={en.tasks.columnName}
            className="h-7"
            maxLength={60}
            onBlur={(event) => commitName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") commitName(event.currentTarget.value);
              if (event.key === "Escape") setRenaming(false);
            }}
          />
        ) : canEdit ? (
          <button
            type="button"
            className="truncate text-sm font-medium hover:underline"
            title={en.tasks.renameColumn}
            onClick={() => setRenaming(true)}
          >
            {section.name}
          </button>
        ) : (
          <span className="truncate text-sm font-medium">{section.name}</span>
        )}
        <span className="text-muted-foreground ml-auto text-xs tabular-nums">{tasks.length}</span>
      </header>
      <SortableContext items={tasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
        <div className="flex min-h-16 flex-col gap-2">
          {children}
        </div>
      </SortableContext>
      {canEdit ? (
        <Input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={en.tasks.addTask}
          aria-label={en.tasks.addTaskTo(section.name)}
          disabled={create.pending}
          className="bg-background h-8"
          onKeyDown={(event) => {
            if (event.key !== "Enter" || !title.trim()) return;
            create.run({ projectId, sectionId: section.id, parentTaskId: null, title });
          }}
        />
      ) : null}
    </section>
  );
}

function SortableTask({
  task,
  disabled,
  onOpen,
  children,
}: {
  task: TaskItem;
  disabled: boolean;
  onOpen: () => void;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    disabled,
  });
  return (
    <button
      ref={setNodeRef}
      type="button"
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        "focus-visible:ring-ring/50 rounded-md text-left outline-none focus-visible:ring-[3px]",
        isDragging && "opacity-40",
      )}
      aria-label={en.tasks.open(task.title)}
      data-testid="task-card"
      onClick={onOpen}
      {...attributes}
      {...listeners}
    >
      {children}
    </button>
  );
}

function TaskList({
  tasks,
  sections,
  members,
  now,
  onOpen,
}: {
  tasks: TaskItem[];
  sections: TaskSection[];
  members: TaskMember[];
  now: string;
  onOpen: (taskId: string) => void;
}) {
  const [assignee, setAssignee] = useState("");
  const [ascending, setAscending] = useState(true);
  const sectionName = new Map(sections.map((section) => [section.id, section.name]));
  const memberName = new Map(members.map((member) => [member.id, member.displayName]));

  const rows = tasks
    .filter((task) => !assignee || task.assigneeId === assignee)
    .sort((a, b) => {
      // Tasks without a due date always come last.
      if (a.dueAt === b.dueAt) return 0;
      if (a.dueAt === null) return 1;
      if (b.dueAt === null) return -1;
      return (a.dueAt < b.dueAt ? -1 : 1) * (ascending ? 1 : -1);
    });

  return (
    <div className="grid gap-3">
      <NativeSelect
        aria-label={en.tasks.filterByAssignee}
        className="w-56"
        value={assignee}
        onChange={(event) => setAssignee(event.target.value)}
      >
        <option value="">{en.tasks.allAssignees}</option>
        {members.map((member) => (
          <option key={member.id} value={member.id}>
            {member.displayName}
          </option>
        ))}
      </NativeSelect>
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">{en.tasks.noTasks}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{en.tasks.fields.title}</TableHead>
              <TableHead>{en.tasks.fields.column}</TableHead>
              <TableHead>{en.tasks.fields.assignee}</TableHead>
              <TableHead>{en.tasks.fields.priority}</TableHead>
              <TableHead>
                <Button
                  variant="ghost"
                  size="sm"
                  className="-ml-3"
                  onClick={() => setAscending((value) => !value)}
                >
                  {en.tasks.fields.due}
                  <ArrowDownUp aria-hidden />
                </Button>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((task) => (
              <TableRow key={task.id}>
                <TableCell>
                  <button
                    type="button"
                    className={cn(
                      "text-left font-medium hover:underline",
                      task.completedAt && "text-muted-foreground line-through",
                    )}
                    onClick={() => onOpen(task.id)}
                  >
                    {task.title}
                  </button>
                </TableCell>
                <TableCell>{sectionName.get(task.sectionId)}</TableCell>
                <TableCell>
                  {task.assigneeId ? memberName.get(task.assigneeId) : en.tasks.unassigned}
                </TableCell>
                <TableCell>
                  {en.tasks.priority[task.priority as keyof typeof en.tasks.priority]}
                </TableCell>
                <TableCell
                  className={cn(
                    task.dueAt && !task.completedAt && task.dueAt < now && "text-destructive",
                  )}
                >
                  {formatDate(task.dueAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
