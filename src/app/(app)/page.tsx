import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listRecentProjects } from "@/features/home/queries";
import { listMyDueTasks } from "@/features/tasks/queries";
import { formatDate, formatDateTime } from "@/lib/format";
import { requireMemberPage } from "@/lib/permissions/guards";
import { en } from "@/messages/en";

export const metadata: Metadata = { title: en.nav.home };

export default async function HomePage() {
  const { supabase, user, profile } = await requireMemberPage();
  // Due dates are stored as the end of a day in UTC.
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const [tasks, projects] = await Promise.all([
    listMyDueTasks(supabase, user.id, `${today}T23:59:59Z`),
    listRecentProjects(supabase),
  ]);

  return (
    <>
      <PageHeader title={en.home.greeting(profile.display_name)} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{en.home.tasksTitle}</CardTitle>
          </CardHeader>
          <CardContent>
            {tasks.length === 0 ? (
              <p className="text-muted-foreground text-sm">{en.home.noTasks}</p>
            ) : (
              <ul className="grid gap-3" data-testid="home-tasks">
                {tasks.map((task) => {
                  const overdue = task.due_at !== null && task.due_at.slice(0, 10) < today;
                  return (
                    <li key={task.id} className="flex flex-wrap items-baseline gap-x-3 text-sm">
                      <Link
                        href={`/projects/${task.project.id}/tasks`}
                        className="font-medium hover:underline"
                      >
                        {task.title}
                      </Link>
                      <span className="text-muted-foreground">{task.project.name}</span>
                      <span className={overdue ? "text-destructive ml-auto" : "ml-auto"}>
                        {overdue ? en.home.overdueSince(formatDate(task.due_at)) : en.home.dueToday}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{en.home.recentTitle}</CardTitle>
          </CardHeader>
          <CardContent>
            {projects.length === 0 ? (
              <p className="text-muted-foreground text-sm">{en.home.noProjects}</p>
            ) : (
              <ul className="grid gap-3">
                {projects.map((project) => (
                  <li key={project.id} className="flex flex-wrap items-baseline gap-x-3 text-sm">
                    <span className="text-muted-foreground tabular-nums">
                      {project.projectNumber}
                    </span>
                    <Link
                      href={`/projects/${project.id}/overview`}
                      className="font-medium hover:underline"
                    >
                      {project.name}
                    </Link>
                    <time dateTime={project.at} className="text-muted-foreground ml-auto">
                      {formatDateTime(project.at)}
                    </time>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
