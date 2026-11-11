"use client";

import { useState, type FormEvent } from "react";

import { FormError, FormField } from "@/components/form-field";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAction } from "@/hooks/use-action";
import {
  INVITABLE_WORKSPACE_ROLES,
  PROJECT_ROLES,
  type ProjectRole,
  type WorkspaceRole,
} from "@/lib/permissions/roles";
import { en } from "@/messages/en";

import { inviteMember } from "../actions";

interface ProjectOption {
  id: string;
  name: string;
}

// Invites a person by email. With `fixedProject` the invitation always adds
// them to that project; otherwise a project is optional.
export function InviteDialog({
  projects = [],
  fixedProject,
}: {
  projects?: ProjectOption[];
  fixedProject?: ProjectOption;
}) {
  const [open, setOpen] = useState(false);
  const [projectId, setProjectId] = useState(fixedProject?.id ?? "");
  const { run, pending, error } = useAction(inviteMember, {
    inlineError: true,
    successMessage: en.members.inviteSent,
    onSuccess: () => setOpen(false),
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    run({
      email: String(form.get("email") ?? ""),
      workspaceRole: String(form.get("workspaceRole") ?? "member") as Exclude<WorkspaceRole, "owner">,
      projectId: projectId || null,
      projectRole: projectId ? (String(form.get("projectRole") ?? "viewer") as ProjectRole) : null,
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">{en.members.invite}</Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={onSubmit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{en.members.inviteTitle}</DialogTitle>
            <DialogDescription>{en.members.inviteDescription}</DialogDescription>
          </DialogHeader>
          <FormField id="invite-email" label={en.auth.email}>
            <Input id="invite-email" name="email" type="email" required />
          </FormField>
          <FormField id="invite-workspace-role" label={en.members.workspaceRole}>
            <NativeSelect id="invite-workspace-role" name="workspaceRole" defaultValue="member">
              {INVITABLE_WORKSPACE_ROLES.map((role) => (
                <option key={role} value={role}>
                  {en.roles.workspace[role]}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          {fixedProject ? null : (
            <FormField id="invite-project" label={en.members.addToProject}>
              <NativeSelect
                id="invite-project"
                value={projectId}
                onChange={(event) => setProjectId(event.target.value)}
              >
                <option value="">{en.members.noProject}</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
          )}
          {projectId ? (
            <FormField id="invite-project-role" label={en.members.projectRole}>
              <NativeSelect id="invite-project-role" name="projectRole" defaultValue="viewer">
                {PROJECT_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {en.roles.project[role]}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
          ) : null}
          <FormError message={error} />
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? en.members.sending : en.members.sendInvitation}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
