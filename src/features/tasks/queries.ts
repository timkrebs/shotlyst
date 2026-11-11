import "server-only";

import { comparePositions } from "@/lib/position";
import type { ServerClient } from "@/lib/supabase/server";

export async function listTaskSections(supabase: ServerClient, projectId: string) {
  const { data, error } = await supabase
    .from("task_sections")
    .select("id, name, color, position, is_done")
    .eq("project_id", projectId);
  if (error) throw new Error(error.message);
  return data
    .sort((a, b) => comparePositions(a.position, b.position))
    .map((section) => ({
      id: section.id,
      name: section.name,
      color: section.color,
      position: section.position,
      isDone: section.is_done,
    }));
}

// Every task of the project, subtasks included, in board order.
export async function listTasks(supabase: ServerClient, projectId: string) {
  const { data, error } = await supabase
    .from("tasks")
    .select(
      "id, section_id, parent_task_id, assignee_id, title, description, priority, labels, due_at, completed_at, position",
    )
    .eq("project_id", projectId);
  if (error) throw new Error(error.message);
  return data
    .sort((a, b) => comparePositions(a.position, b.position))
    .map((task) => ({
      id: task.id,
      sectionId: task.section_id,
      parentTaskId: task.parent_task_id,
      assigneeId: task.assignee_id,
      title: task.title,
      description: task.description,
      priority: task.priority,
      labels: task.labels,
      dueAt: task.due_at,
      completedAt: task.completed_at,
      position: task.position,
    }));
}

// Open tasks assigned to the user that are due up to the end of the given
// day, across every project they can read. For Home.
export async function listMyDueTasks(supabase: ServerClient, userId: string, endOfDay: string) {
  const { data, error } = await supabase
    .from("tasks")
    .select("id, title, due_at, priority, project:projects(id, name, archived_at)")
    .eq("assignee_id", userId)
    .is("completed_at", null)
    .lte("due_at", endOfDay)
    .order("due_at");
  if (error) throw new Error(error.message);
  return data.filter((task) => task.project.archived_at === null);
}

export type TaskSection = Awaited<ReturnType<typeof listTaskSections>>[number];
export type TaskItem = Awaited<ReturnType<typeof listTasks>>[number];
