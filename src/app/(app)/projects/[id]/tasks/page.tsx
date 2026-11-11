import { listProjectMembers } from "@/features/projects/queries";
import { TaskBoard } from "@/features/tasks/components/task-board";
import { listTaskSections, listTasks } from "@/features/tasks/queries";
import { requireProjectPage } from "@/lib/permissions/guards";

export default async function ProjectTasksPage({ params }: PageProps<"/projects/[id]/tasks">) {
  const { id } = await params;
  const { supabase, user } = await requireProjectPage(id);
  const [sections, tasks, members] = await Promise.all([
    listTaskSections(supabase, id),
    listTasks(supabase, id),
    listProjectMembers(supabase, id),
  ]);

  return (
    <TaskBoard
      projectId={id}
      sections={sections}
      tasks={tasks}
      currentUserId={user.id}
      now={new Date().toISOString()}
      members={members
        .filter((member) => !member.deactivated)
        .map((member) => ({
          id: member.userId,
          displayName: member.displayName,
          color: member.color,
        }))}
    />
  );
}
