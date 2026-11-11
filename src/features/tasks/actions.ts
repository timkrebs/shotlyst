"use server";

import { revalidatePath } from "next/cache";

import { ActionError, defineAction } from "@/lib/action";
import { logActivity } from "@/lib/activity";
import { requireProjectRole } from "@/lib/permissions/guards";
import { comparePositions, positionAfter } from "@/lib/position";
import { en } from "@/messages/en";

import {
  createTaskSchema,
  moveTaskSchema,
  renameSectionSchema,
  setTaskCompletedSchema,
  taskIdSchema,
  updateTaskSchema,
} from "./schema";

function revalidate(projectId: string) {
  revalidatePath(`/projects/${projectId}/tasks`);
  revalidatePath("/");
}

export const createTask = defineAction(createTaskSchema, async (input) => {
  const { supabase, user } = await requireProjectRole(input.projectId, "editor");
  const { data: siblings } = await supabase
    .from("tasks")
    .select("position")
    .eq("project_id", input.projectId)
    .eq("section_id", input.sectionId);
  const last = (siblings ?? []).map((row) => row.position).sort(comparePositions).at(-1) ?? null;

  const { data, error } = await supabase
    .from("tasks")
    .insert({
      project_id: input.projectId,
      section_id: input.sectionId,
      parent_task_id: input.parentTaskId,
      title: input.title,
      position: positionAfter(last),
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error) throw new ActionError(en.tasks.errors.saveFailed);

  await logActivity(supabase, {
    projectId: input.projectId,
    action: "task.created",
    entityType: "task",
    entityId: data.id,
    summary: en.activity.taskCreated(input.title),
  });
  revalidate(input.projectId);
  return { id: data.id };
});

export const updateTask = defineAction(updateTaskSchema, async (input) => {
  const { supabase } = await requireProjectRole(input.projectId, "editor");
  const { data, error } = await supabase
    .from("tasks")
    .update({
      title: input.title,
      description: input.description,
      assignee_id: input.assigneeId,
      priority: input.priority,
      labels: input.labels,
      // The end of the chosen day, in UTC.
      due_at: input.dueDate ? `${input.dueDate}T23:59:59Z` : null,
    })
    .eq("id", input.taskId)
    .eq("project_id", input.projectId)
    .select("id")
    .maybeSingle();
  if (error || !data) throw new ActionError(en.tasks.errors.saveFailed);

  await logActivity(supabase, {
    projectId: input.projectId,
    action: "task.updated",
    entityType: "task",
    entityId: input.taskId,
    summary: en.activity.taskUpdated(input.title),
  });
  revalidate(input.projectId);
});

// Moves a task to a column and position. The database sets or clears
// completed_at from the column.
export const moveTask = defineAction(moveTaskSchema, async (input) => {
  const { supabase } = await requireProjectRole(input.projectId, "editor");
  const { data, error } = await supabase
    .from("tasks")
    .update({ section_id: input.sectionId, position: input.position })
    .eq("id", input.taskId)
    .eq("project_id", input.projectId)
    .select("id, title, section:task_sections(name)")
    .maybeSingle();
  if (error || !data) throw new ActionError(en.tasks.errors.moveFailed);

  await logActivity(supabase, {
    projectId: input.projectId,
    action: "task.moved",
    entityType: "task",
    entityId: input.taskId,
    summary: en.activity.taskMoved(data.title, data.section.name),
  });
  revalidate(input.projectId);
});

// Editors complete any task; a commenter completes tasks assigned to them.
export const setTaskCompleted = defineAction(setTaskCompletedSchema, async (input) => {
  const { supabase } = await requireProjectRole(input.projectId, "commenter");
  const { error } = await supabase.rpc("set_task_completed", {
    p_task_id: input.taskId,
    p_completed: input.completed,
  });
  if (error) throw new ActionError(en.tasks.errors.completeFailed);

  const { data: task } = await supabase
    .from("tasks")
    .select("title")
    .eq("id", input.taskId)
    .maybeSingle();
  await logActivity(supabase, {
    projectId: input.projectId,
    action: input.completed ? "task.completed" : "task.reopened",
    entityType: "task",
    entityId: input.taskId,
    summary: input.completed
      ? en.activity.taskCompleted(task?.title ?? "")
      : en.activity.taskReopened(task?.title ?? ""),
  });
  revalidate(input.projectId);
});

export const deleteTask = defineAction(taskIdSchema, async ({ projectId, taskId }) => {
  const { supabase } = await requireProjectRole(projectId, "editor");
  const { data, error } = await supabase
    .from("tasks")
    .delete()
    .eq("id", taskId)
    .eq("project_id", projectId)
    .select("id, title")
    .maybeSingle();
  if (error || !data) throw new ActionError(en.tasks.errors.deleteFailed);

  await logActivity(supabase, {
    projectId,
    action: "task.deleted",
    entityType: "task",
    entityId: taskId,
    summary: en.activity.taskDeleted(data.title),
  });
  revalidate(projectId);
});

export const renameTaskSection = defineAction(renameSectionSchema, async (input) => {
  const { supabase } = await requireProjectRole(input.projectId, "editor");
  const { data, error } = await supabase
    .from("task_sections")
    .update({ name: input.name })
    .eq("id", input.sectionId)
    .eq("project_id", input.projectId)
    .select("id")
    .maybeSingle();
  if (error || !data) throw new ActionError(en.tasks.errors.saveFailed);

  await logActivity(supabase, {
    projectId: input.projectId,
    action: "task_section.renamed",
    entityType: "task_section",
    entityId: input.sectionId,
    summary: en.activity.sectionRenamed(input.name),
  });
  revalidate(input.projectId);
});
