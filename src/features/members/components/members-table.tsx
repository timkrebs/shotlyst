"use client";

import { MoreHorizontal } from "lucide-react";
import { useState } from "react";

import { ConfirmDialog } from "@/components/confirm-button";
import { NativeSelect } from "@/components/native-select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { UserAvatar } from "@/components/user-avatar";
import { useAction } from "@/hooks/use-action";
import { INVITABLE_WORKSPACE_ROLES, type WorkspaceRole } from "@/lib/permissions/roles";
import { en } from "@/messages/en";

import {
  changeWorkspaceRole,
  deactivateMember,
  reactivateMember,
  transferOwnership,
} from "../actions";

export interface MemberRow {
  id: string;
  email: string;
  displayName: string;
  color: string;
  avatarUrl: string | null;
  workspaceRole: WorkspaceRole;
  deactivated: boolean;
  lastActive: string;
  projectCount: number;
}

type Pending = { kind: "deactivate" | "transfer"; member: MemberRow } | null;

export function MembersTable({
  members,
  currentUserId,
  currentUserIsOwner,
}: {
  members: MemberRow[];
  currentUserId: string;
  currentUserIsOwner: boolean;
}) {
  const [confirm, setConfirm] = useState<Pending>(null);
  const changeRole = useAction(changeWorkspaceRole, { successMessage: en.members.roleChanged });
  const deactivate = useAction(deactivateMember, { successMessage: en.members.deactivated });
  const reactivate = useAction(reactivateMember, { successMessage: en.members.reactivated });
  const transfer = useAction(transferOwnership, { successMessage: en.members.ownershipTransferred });

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{en.members.columns.member}</TableHead>
            <TableHead>{en.members.columns.role}</TableHead>
            <TableHead>{en.members.columns.lastActive}</TableHead>
            <TableHead className="text-right">{en.members.columns.projects}</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.map((member) => {
            const isSelf = member.id === currentUserId;
            const isOwner = member.workspaceRole === "owner";
            const locked = isSelf || isOwner || member.deactivated;
            return (
              <TableRow key={member.id} data-testid={`member-${member.email}`}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <UserAvatar
                      name={member.displayName}
                      color={member.color}
                      url={member.avatarUrl}
                    />
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {member.displayName}
                        {isSelf ? (
                          <span className="text-muted-foreground font-normal"> {en.members.you}</span>
                        ) : null}
                      </p>
                      <p className="text-muted-foreground truncate text-xs">{member.email}</p>
                    </div>
                    {member.deactivated ? (
                      <Badge variant="secondary">{en.members.deactivatedBadge}</Badge>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell>
                  {locked ? (
                    en.roles.workspace[member.workspaceRole]
                  ) : (
                    <NativeSelect
                      aria-label={en.members.columns.role}
                      className="w-32"
                      value={member.workspaceRole}
                      disabled={changeRole.pending}
                      onChange={(event) =>
                        changeRole.run({
                          userId: member.id,
                          role: event.target.value as Exclude<WorkspaceRole, "owner">,
                        })
                      }
                    >
                      {INVITABLE_WORKSPACE_ROLES.map((role) => (
                        <option key={role} value={role}>
                          {en.roles.workspace[role]}
                        </option>
                      ))}
                    </NativeSelect>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">{member.lastActive}</TableCell>
                <TableCell className="text-right tabular-nums">{member.projectCount}</TableCell>
                <TableCell>
                  {isSelf || isOwner ? null : (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={en.members.actionsFor(member.displayName)}
                        >
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {member.deactivated ? (
                          <DropdownMenuItem onSelect={() => reactivate.run({ userId: member.id })}>
                            {en.members.reactivate}
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem
                            onSelect={() => setConfirm({ kind: "deactivate", member })}
                          >
                            {en.members.deactivate}
                          </DropdownMenuItem>
                        )}
                        {currentUserIsOwner && !member.deactivated ? (
                          <DropdownMenuItem
                            onSelect={() => setConfirm({ kind: "transfer", member })}
                          >
                            {en.members.makeOwner}
                          </DropdownMenuItem>
                        ) : null}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!open) setConfirm(null);
        }}
        title={
          confirm?.kind === "transfer"
            ? en.members.transferTitle(confirm.member.displayName)
            : en.members.deactivateTitle(confirm?.member.displayName ?? "")
        }
        description={
          confirm?.kind === "transfer"
            ? en.members.transferDescription
            : en.members.deactivateDescription
        }
        confirmLabel={confirm?.kind === "transfer" ? en.members.makeOwner : en.members.deactivate}
        pending={deactivate.pending || transfer.pending}
        onConfirm={() => {
          if (!confirm) return;
          if (confirm.kind === "transfer") transfer.run({ userId: confirm.member.id });
          else deactivate.run({ userId: confirm.member.id });
          setConfirm(null);
        }}
      />
    </>
  );
}
