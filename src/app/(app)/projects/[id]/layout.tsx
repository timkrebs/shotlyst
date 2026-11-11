import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";

import { Badge } from "@/components/ui/badge";
import { ProjectNav } from "@/features/projects/components/project-nav";
import { getProject } from "@/features/projects/queries";
import { requireProjectPage } from "@/lib/permissions/guards";
import { ProjectAccessProvider } from "@/lib/permissions/use-permissions";
import { en } from "@/messages/en";

export const metadata: Metadata = { title: en.nav.projects };

export default async function ProjectLayout({ children, params }: LayoutProps<"/projects/[id]">) {
  const { id } = await params;
  // A malformed ID is the same as an unknown project.
  if (!z.uuid().safeParse(id).success) notFound();

  const { supabase, role } = await requireProjectPage(id);
  const project = await getProject(supabase, id);
  if (!project) notFound();

  return (
    <ProjectAccessProvider projectId={id} role={role}>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground text-sm tabular-nums">{project.project_number}</span>
        <span className="truncate text-lg font-semibold tracking-tight">{project.name}</span>
        {project.archived_at ? <Badge variant="secondary">{en.projects.archivedBadge}</Badge> : null}
        <Badge variant="outline" className="ml-auto">
          {en.roles.project[role]}
        </Badge>
      </div>
      <ProjectNav projectId={id} />
      {children}
    </ProjectAccessProvider>
  );
}
