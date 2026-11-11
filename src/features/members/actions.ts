"use server";

import { revalidatePath } from "next/cache";

import { ActionError, defineAction } from "@/lib/action";
import { logActivity } from "@/lib/activity";
import { publicEnv } from "@/lib/env";
import { requireAdmin, requireOwner } from "@/lib/permissions/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateToken, hashToken } from "@/lib/tokens";
import { en } from "@/messages/en";

import { changeRoleSchema, invitationIdSchema, inviteSchema, memberIdSchema } from "./schema";

const INVITATION_DAYS = 7;
// Supabase has no "ban forever"; a century is close enough.
const BAN_DURATION = "876000h";

function expiry(): string {
  return new Date(Date.now() + INVITATION_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

// Sends the invitation email through Supabase Auth. The link carries our own
// token (checked by accept_invitation) and Supabase's one-time token hash,
// which the email template appends. Returns an error message or null.
async function sendInvitationEmail(email: string, token: string): Promise<string | null> {
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${publicEnv.appUrl}/accept-invite?invitation=${encodeURIComponent(token)}`,
  });
  return error ? error.message : null;
}

// Removes the auth user behind an invitation that was never accepted, so a
// revoked link cannot sign anyone in.
async function deleteUnacceptedUser(email: string) {
  const admin = createAdminClient();
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const user = data?.users.find((candidate) => candidate.email?.toLowerCase() === email);
  if (!user) return;
  const { data: profile } = await admin
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile) await admin.auth.admin.deleteUser(user.id);
}

export const inviteMember = defineAction(inviteSchema, async (input) => {
  const { supabase, user } = await requireAdmin();

  const { data: members } = await supabase.rpc("list_members");
  if (members?.some((member) => member.email === input.email)) {
    throw new ActionError(en.members.errors.alreadyMember);
  }

  const token = generateToken();
  // A new invitation replaces a pending one for the same address.
  await supabase.from("invitations").delete().eq("email", input.email).is("accepted_at", null);
  const { data: invitation, error } = await supabase
    .from("invitations")
    .insert({
      email: input.email,
      workspace_role: input.workspaceRole,
      project_id: input.projectId,
      project_role: input.projectRole,
      token_hash: hashToken(token),
      expires_at: expiry(),
      invited_by: user.id,
    })
    .select("id")
    .single();
  if (error) throw new ActionError(en.members.errors.inviteFailed);

  const sendError = await sendInvitationEmail(input.email, token);
  if (sendError) {
    console.error("invitation email failed", sendError);
    await supabase.from("invitations").delete().eq("id", invitation.id);
    throw new ActionError(en.members.errors.sendFailed);
  }

  await logActivity(supabase, {
    projectId: input.projectId,
    action: "invitation.created",
    entityType: "invitation",
    entityId: invitation.id,
    summary: en.activity.invited(input.email),
  });
  revalidatePath("/settings/members");
  if (input.projectId) revalidatePath(`/projects/${input.projectId}`, "layout");
});

export const resendInvitation = defineAction(invitationIdSchema, async ({ invitationId }) => {
  const { supabase } = await requireAdmin();
  const token = generateToken();
  const { data: invitation } = await supabase
    .from("invitations")
    .update({ token_hash: hashToken(token), expires_at: expiry() })
    .eq("id", invitationId)
    .is("accepted_at", null)
    .select("id, email, project_id")
    .maybeSingle();
  if (!invitation) throw new ActionError(en.members.errors.invitationGone);

  const sendError = await sendInvitationEmail(invitation.email, token);
  if (sendError) {
    console.error("invitation email failed", sendError);
    throw new ActionError(en.members.errors.sendFailed);
  }

  await logActivity(supabase, {
    projectId: invitation.project_id,
    action: "invitation.resent",
    entityType: "invitation",
    entityId: invitation.id,
    summary: en.activity.invitationResent(invitation.email),
  });
  revalidatePath("/settings/members");
});

export const revokeInvitation = defineAction(invitationIdSchema, async ({ invitationId }) => {
  const { supabase } = await requireAdmin();
  const { data: invitation } = await supabase
    .from("invitations")
    .delete()
    .eq("id", invitationId)
    .is("accepted_at", null)
    .select("id, email, project_id")
    .maybeSingle();
  if (!invitation) throw new ActionError(en.members.errors.invitationGone);

  await deleteUnacceptedUser(invitation.email);
  await logActivity(supabase, {
    projectId: invitation.project_id,
    action: "invitation.revoked",
    entityType: "invitation",
    entityId: invitation.id,
    summary: en.activity.invitationRevoked(invitation.email),
  });
  revalidatePath("/settings/members");
});

export const changeWorkspaceRole = defineAction(changeRoleSchema, async ({ userId, role }) => {
  const { supabase } = await requireAdmin();
  // The profile guard trigger rejects changes to the owner and to oneself.
  const { data, error } = await supabase
    .from("profiles")
    .update({ workspace_role: role })
    .eq("id", userId)
    .select("id, display_name")
    .maybeSingle();
  if (error || !data) throw new ActionError(en.members.errors.roleChangeFailed);

  await logActivity(supabase, {
    projectId: null,
    action: "member.role_changed",
    entityType: "profile",
    entityId: userId,
    summary: en.activity.roleChanged(data.display_name, en.roles.workspace[role]),
  });
  revalidatePath("/settings/members");
});

async function setDeactivated(userId: string, deactivated: boolean) {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase
    .from("profiles")
    .update({ deactivated_at: deactivated ? new Date().toISOString() : null })
    .eq("id", userId)
    .select("id, display_name")
    .maybeSingle();
  if (error || !data) throw new ActionError(en.members.errors.statusChangeFailed);

  // RLS already shuts the member out; the ban also stops token refreshes.
  const admin = createAdminClient();
  const { error: banError } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: deactivated ? BAN_DURATION : "none",
  });
  if (banError) console.error("auth ban update failed", banError.message);

  await logActivity(supabase, {
    projectId: null,
    action: deactivated ? "member.deactivated" : "member.reactivated",
    entityType: "profile",
    entityId: userId,
    summary: deactivated
      ? en.activity.deactivated(data.display_name)
      : en.activity.reactivated(data.display_name),
  });
  revalidatePath("/settings/members");
}

export const deactivateMember = defineAction(memberIdSchema, ({ userId }) =>
  setDeactivated(userId, true),
);

export const reactivateMember = defineAction(memberIdSchema, ({ userId }) =>
  setDeactivated(userId, false),
);

export const transferOwnership = defineAction(memberIdSchema, async ({ userId }) => {
  const { supabase } = await requireOwner();
  const { error } = await supabase.rpc("transfer_ownership", { p_new_owner: userId });
  if (error) throw new ActionError(en.members.errors.transferFailed);

  await logActivity(supabase, {
    projectId: null,
    action: "workspace.ownership_transferred",
    entityType: "profile",
    entityId: userId,
    summary: en.activity.ownershipTransferred,
  });
  revalidatePath("/settings/members");
});
