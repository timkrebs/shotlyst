"use client";

import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAction } from "@/hooks/use-action";
import { en } from "@/messages/en";

import { resendInvitation, revokeInvitation } from "../actions";

export interface InvitationRow {
  id: string;
  email: string;
  role: string;
  project: string | null;
  expires: string;
  expired: boolean;
}

export function InvitationsTable({ invitations }: { invitations: InvitationRow[] }) {
  const resend = useAction(resendInvitation, { successMessage: en.members.inviteSent });
  const revoke = useAction(revokeInvitation, { successMessage: en.members.invitationRevoked });

  if (invitations.length === 0) {
    return <p className="text-muted-foreground text-sm">{en.members.noInvitations}</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{en.auth.email}</TableHead>
          <TableHead>{en.members.columns.role}</TableHead>
          <TableHead>{en.members.columns.project}</TableHead>
          <TableHead>{en.members.columns.expires}</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {invitations.map((invitation) => (
          <TableRow key={invitation.id} data-testid={`invitation-${invitation.email}`}>
            <TableCell className="font-medium">{invitation.email}</TableCell>
            <TableCell>{invitation.role}</TableCell>
            <TableCell>{invitation.project ?? "–"}</TableCell>
            <TableCell className={invitation.expired ? "text-destructive" : undefined}>
              {invitation.expired ? en.members.expired : invitation.expires}
            </TableCell>
            <TableCell>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={resend.pending}
                  onClick={() => resend.run({ invitationId: invitation.id })}
                >
                  {en.members.resend}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={revoke.pending}
                  onClick={() => revoke.run({ invitationId: invitation.id })}
                >
                  {en.members.revoke}
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
