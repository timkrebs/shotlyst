import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { listBrands, listClients } from "@/features/library/queries";
import { ProjectCard } from "@/features/projects/components/project-card";
import { ProjectFormDialog } from "@/features/projects/components/project-form-dialog";
import { getDefaultTimezone, listProjects } from "@/features/projects/queries";
import { timeZones } from "@/lib/format";
import { requireMemberPage } from "@/lib/permissions/guards";
import { en } from "@/messages/en";

export const metadata: Metadata = { title: en.nav.projects };

export default async function ProjectsPage({ searchParams }: PageProps<"/projects">) {
  const { supabase } = await requireMemberPage();
  const archived = (await searchParams).archived === "1";

  const [projects, clients, brands, defaultTimezone, nextNumber] = await Promise.all([
    listProjects(supabase, archived),
    listClients(supabase),
    listBrands(supabase),
    getDefaultTimezone(supabase),
    supabase.rpc("next_project_number").then(({ data }) => data ?? ""),
  ]);

  return (
    <>
      <PageHeader title={archived ? en.projects.archivedTitle : en.nav.projects}>
        <Button variant="outline" size="sm" asChild>
          <Link href={archived ? "/projects" : "/projects?archived=1"}>
            {archived ? en.projects.showActive : en.projects.showArchived}
          </Link>
        </Button>
        <ProjectFormDialog
          trigger={<Button size="sm">{en.projects.new}</Button>}
          clients={clients}
          brands={brands}
          timeZones={timeZones()}
          values={{
            name: "",
            projectNumber: nextNumber,
            kind: "short_form",
            clientId: null,
            brandId: null,
            aspectRatio: "16:9",
            timezone: defaultTimezone,
            description: null,
            status: "planning",
          }}
        />
      </PageHeader>
      {projects.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border border-dashed p-10 text-center text-sm">
          {archived ? en.projects.emptyArchived : en.projects.empty}
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {projects.map((project) => (
            <li key={project.id} className="contents">
              <ProjectCard project={project} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
