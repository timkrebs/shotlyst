import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UserAvatar } from "@/components/user-avatar";
import { listBrands, listClients } from "@/features/library/queries";
import { listActiveProfiles } from "@/features/members/queries";
import {
  DuplicateProjectDialog,
  ProjectActions,
} from "@/features/projects/components/project-actions";
import { ProjectFormDialog } from "@/features/projects/components/project-form-dialog";
import { ProjectMembersDialog } from "@/features/projects/components/project-members-dialog";
import {
  getProject,
  listProjectActivity,
  listProjectMembers,
} from "@/features/projects/queries";
import { PROJECT_KINDS, PROJECT_STATUSES } from "@/features/projects/schema";
import { formatDateTime, timeZones } from "@/lib/format";
import { requireProjectPage } from "@/lib/permissions/guards";
import { isAdminRole, projectPermissions } from "@/lib/permissions/roles";
import { en } from "@/messages/en";

export default async function ProjectOverviewPage({
  params,
}: PageProps<"/projects/[id]/overview">) {
  const { id } = await params;
  const { supabase, profile, role } = await requireProjectPage(id);
  const { canEdit } = projectPermissions(role);

  const [project, members, activity, clients, brands, profiles, nextNumber] = await Promise.all([
    getProject(supabase, id),
    listProjectMembers(supabase, id),
    listProjectActivity(supabase, id),
    listClients(supabase),
    listBrands(supabase),
    listActiveProfiles(supabase),
    supabase.rpc("next_project_number").then(({ data }) => data ?? ""),
  ]);
  if (!project) notFound();

  const memberIds = new Set(members.map((member) => member.userId));
  const candidates = profiles.filter((candidate) => !memberIds.has(candidate.id));
  const status = PROJECT_STATUSES.find((value) => value === project.status) ?? "planning";
  const kind = PROJECT_KINDS.find((value) => value === project.kind) ?? "short_form";

  const facts: [string, string][] = [
    [en.projects.fields.kind, en.projects.kind[kind]],
    [en.projects.fields.status, en.projects.status[status]],
    [en.projects.fields.client, project.client?.name ?? "–"],
    [en.projects.fields.brand, project.brand?.name ?? "–"],
    [en.projects.fields.aspectRatio, project.aspect_ratio],
    [en.projects.fields.timezone, project.timezone],
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>{en.projects.details}</CardTitle>
          <CardAction className="flex flex-wrap gap-2">
            <DuplicateProjectDialog
              projectId={project.id}
              name={project.name}
              suggestedNumber={nextNumber}
            />
            {canEdit ? (
              <ProjectFormDialog
                trigger={
                  <Button variant="outline" size="sm">
                    {en.common.edit}
                  </Button>
                }
                clients={clients}
                brands={brands}
                timeZones={timeZones()}
                values={{
                  id: project.id,
                  name: project.name,
                  projectNumber: project.project_number,
                  kind,
                  clientId: project.client_id,
                  brandId: project.brand_id,
                  aspectRatio: project.aspect_ratio,
                  timezone: project.timezone,
                  description: project.description,
                  status,
                }}
              />
            ) : null}
            <ProjectActions
              projectId={project.id}
              name={project.name}
              archived={project.archived_at !== null}
            />
          </CardAction>
        </CardHeader>
        <CardContent className="grid gap-4">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
            {facts.map(([label, value]) => (
              <div key={label}>
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="font-medium">{value}</dd>
              </div>
            ))}
          </dl>
          {project.description ? (
            <p className="text-sm whitespace-pre-wrap">{project.description}</p>
          ) : null}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{en.projects.members.title}</CardTitle>
          <CardAction>
            <ProjectMembersDialog
              project={{ id: project.id, name: project.name }}
              members={members}
              candidates={candidates}
              canInvite={isAdminRole(profile.workspace_role)}
            />
          </CardAction>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-3">
            {members.map((member) => (
              <li key={member.userId} className="flex items-center gap-3 text-sm">
                <UserAvatar name={member.displayName} color={member.color} url={member.avatarUrl} />
                <span className="min-w-0 flex-1 truncate">{member.displayName}</span>
                <span className="text-muted-foreground">{en.roles.project[member.role]}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      <Card className="lg:col-span-3">
        <CardHeader>
          <CardTitle>{en.projects.recentActivity}</CardTitle>
        </CardHeader>
        <CardContent>
          {activity.length === 0 ? (
            <p className="text-muted-foreground text-sm">{en.projects.noActivity}</p>
          ) : (
            <ul className="grid gap-2 text-sm">
              {activity.map((entry) => (
                <li key={entry.id} className="flex flex-wrap justify-between gap-x-4">
                  <span>
                    <span className="font-medium">{entry.actor?.display_name ?? "–"}</span>
                    {": "}
                    {entry.summary}
                  </span>
                  <time dateTime={entry.created_at} className="text-muted-foreground">
                    {formatDateTime(entry.created_at)}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
