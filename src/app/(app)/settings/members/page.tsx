import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";
import { InvitationsTable } from "@/features/members/components/invitations-table";
import { InviteDialog } from "@/features/members/components/invite-dialog";
import { MembersTable } from "@/features/members/components/members-table";
import { listMembers, listPendingInvitations } from "@/features/members/queries";
import { listProjectOptions } from "@/features/projects/queries";
import { formatDate, formatDateTime } from "@/lib/format";
import { requireAdminPage } from "@/lib/permissions/guards";
import { signedUrls } from "@/lib/storage";
import { en } from "@/messages/en";

export const metadata: Metadata = { title: en.nav.members };

export default async function MembersPage() {
  const { supabase, user, profile } = await requireAdminPage();
  const [members, invitations, projects] = await Promise.all([
    listMembers(supabase),
    listPendingInvitations(supabase),
    listProjectOptions(supabase),
  ]);

  const avatarIds = members.map((member) => member.avatar_file_id).filter((id) => id !== null);
  const { data: avatarFiles } = avatarIds.length
    ? await supabase.from("files").select("id, path").in("id", avatarIds)
    : { data: [] };
  const urls = await signedUrls(supabase, (avatarFiles ?? []).map((file) => file.path));
  const avatarUrl = (fileId: string | null) => {
    const path = avatarFiles?.find((file) => file.id === fileId)?.path;
    return path ? (urls.get(path) ?? null) : null;
  };
  // Rendered per request, so "now" is the time of the request.
  const now = new Date().toISOString();

  return (
    <>
      <PageHeader title={en.nav.members} description={en.members.description}>
        <InviteDialog projects={projects} />
      </PageHeader>
      <MembersTable
        currentUserId={user.id}
        currentUserIsOwner={profile.workspace_role === "owner"}
        members={members.map((member) => ({
          id: member.id,
          email: member.email,
          displayName: member.display_name,
          color: member.color,
          avatarUrl: avatarUrl(member.avatar_file_id),
          workspaceRole: member.workspace_role,
          deactivated: member.deactivated_at !== null,
          lastActive: member.last_sign_in_at ? formatDateTime(member.last_sign_in_at) : en.members.never,
          projectCount: member.project_count,
        }))}
      />
      <h2 className="mt-10 mb-3 text-base font-semibold">{en.members.pendingInvitations}</h2>
      <InvitationsTable
        invitations={invitations.map((invitation) => ({
          id: invitation.id,
          email: invitation.email,
          role: en.roles.workspace[invitation.workspace_role],
          project: invitation.project
            ? `${invitation.project.name}${
                invitation.project_role ? ` (${en.roles.project[invitation.project_role]})` : ""
              }`
            : null,
          expires: formatDate(invitation.expires_at),
          expired: invitation.expires_at < now,
        }))}
      />
    </>
  );
}
