"use client";

import { X } from "lucide-react";
import { useState, type FormEvent } from "react";

import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { UserAvatar } from "@/components/user-avatar";
import { InviteDialog } from "@/features/members/components/invite-dialog";
import { useAction } from "@/hooks/use-action";
import { PROJECT_ROLES, type ProjectRole } from "@/lib/permissions/roles";
import { usePermissions } from "@/lib/permissions/use-permissions";
import { en } from "@/messages/en";

import { addProjectMember, changeProjectMemberRole, removeProjectMember } from "../actions";
import type { ProjectMember } from "../queries";

interface Candidate {
  id: string;
  display_name: string;
}

// Lists the project's members. Editors change roles, remove people and add
// existing workspace members; owner and admin can also invite by email.
export function ProjectMembersDialog({
  project,
  members,
  candidates,
  canInvite,
}: {
  project: { id: string; name: string };
  members: ProjectMember[];
  candidates: Candidate[];
  canInvite: boolean;
}) {
  const { canManageMembers } = usePermissions(project.id);
  const [open, setOpen] = useState(false);
  const add = useAction(addProjectMember, { successMessage: en.projects.members.added });
  const changeRole = useAction(changeProjectMemberRole, { successMessage: en.members.roleChanged });
  const remove = useAction(removeProjectMember, { successMessage: en.projects.members.removed });

  function onAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const userId = String(form.get("userId") ?? "");
    if (!userId) return;
    add.run({
      projectId: project.id,
      userId,
      role: String(form.get("role") ?? "viewer") as ProjectRole,
    });
    event.currentTarget.reset();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          {canManageMembers ? en.projects.members.manage : en.projects.members.view}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{en.projects.members.title}</DialogTitle>
          <DialogDescription>{en.projects.members.description}</DialogDescription>
        </DialogHeader>
        <ul className="grid gap-3">
          {members.map((member) => (
            <li key={member.userId} className="flex items-center gap-3">
              <UserAvatar name={member.displayName} color={member.color} url={member.avatarUrl} />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {member.displayName}
              </span>
              {canManageMembers ? (
                <>
                  <NativeSelect
                    aria-label={en.projects.members.roleOf(member.displayName)}
                    className="w-32"
                    value={member.role}
                    disabled={changeRole.pending}
                    onChange={(event) =>
                      changeRole.run({
                        projectId: project.id,
                        userId: member.userId,
                        role: event.target.value as ProjectRole,
                      })
                    }
                  >
                    {PROJECT_ROLES.map((role) => (
                      <option key={role} value={role}>
                        {en.roles.project[role]}
                      </option>
                    ))}
                  </NativeSelect>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={en.projects.members.remove(member.displayName)}
                    disabled={remove.pending}
                    onClick={() => remove.run({ projectId: project.id, userId: member.userId })}
                  >
                    <X />
                  </Button>
                </>
              ) : (
                <span className="text-muted-foreground text-sm">
                  {en.roles.project[member.role]}
                </span>
              )}
            </li>
          ))}
        </ul>
        {canManageMembers ? (
          <form onSubmit={onAdd} className="grid gap-2 border-t pt-4">
            <Label htmlFor="add-member">{en.projects.members.addExisting}</Label>
            <div className="flex gap-2">
              <NativeSelect id="add-member" name="userId" defaultValue="" required>
                <option value="" disabled>
                  {candidates.length > 0
                    ? en.projects.members.choose
                    : en.projects.members.noCandidates}
                </option>
                {candidates.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.display_name}
                  </option>
                ))}
              </NativeSelect>
              <NativeSelect
                name="role"
                defaultValue="viewer"
                className="w-36"
                aria-label={en.members.projectRole}
              >
                {PROJECT_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {en.roles.project[role]}
                  </option>
                ))}
              </NativeSelect>
              <Button type="submit" disabled={add.pending || candidates.length === 0}>
                {en.common.add}
              </Button>
            </div>
          </form>
        ) : null}
        {canInvite ? (
          <div className="flex items-center justify-between gap-4 border-t pt-4">
            <p className="text-muted-foreground text-sm">{en.projects.members.inviteHint}</p>
            <InviteDialog fixedProject={project} />
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
