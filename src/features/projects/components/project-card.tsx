import { Clapperboard } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { UserAvatar } from "@/components/user-avatar";
import { en } from "@/messages/en";

import type { ProjectListItem } from "../queries";

const MAX_AVATARS = 5;

export function ProjectCard({ project }: { project: ProjectListItem }) {
  const members = project.members.filter((member) => member.profile.deactivated_at === null);
  return (
    <Link
      href={`/projects/${project.id}/overview`}
      className="bg-card hover:border-foreground/30 focus-visible:ring-ring/50 group flex flex-col overflow-hidden rounded-lg border transition-colors outline-none focus-visible:ring-[3px]"
    >
      <div className="bg-muted flex aspect-video items-center justify-center overflow-hidden">
        {project.coverUrl ? (
          <img src={project.coverUrl} alt="" className="size-full object-cover" />
        ) : (
          <Clapperboard className="text-muted-foreground/50 size-10" aria-hidden />
        )}
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <p className="text-muted-foreground text-xs tabular-nums">{project.project_number}</p>
          <h2 className="truncate font-medium">{project.name}</h2>
          <p className="text-muted-foreground truncate text-sm">
            {project.client?.name ?? en.projects.noClient}
          </p>
        </div>
        <div className="mt-auto flex items-center justify-between gap-2">
          <div className="flex -space-x-2">
            {members.slice(0, MAX_AVATARS).map((member) => (
              <UserAvatar
                key={member.user_id}
                name={member.profile.display_name}
                color={member.profile.color}
                url={member.avatarUrl}
                className="ring-card size-7 ring-2"
              />
            ))}
            {members.length > MAX_AVATARS ? (
              <span className="bg-muted ring-card flex size-7 items-center justify-center rounded-full text-xs ring-2">
                +{members.length - MAX_AVATARS}
              </span>
            ) : null}
          </div>
          <Badge variant="outline">{en.projects.kind[project.kind]}</Badge>
        </div>
      </div>
    </Link>
  );
}
