"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { ActionError, defineAction } from "@/lib/action";
import { serverEnv } from "@/lib/env";
import { safeNextPath } from "@/lib/permissions/routes";
import { createClient } from "@/lib/supabase/server";
import { keyedHash } from "@/lib/tokens";
import { en } from "@/messages/en";

import {
  acceptInviteSchema,
  requestResetSchema,
  signInSchema,
  updatePasswordSchema,
} from "./schema";

// Throttle key for the caller: a keyed hash of the client IP, so nobody can
// lock out an address without knowing the server secret.
async function throttleKey(): Promise<string> {
  const requestHeaders = await headers();
  const forwarded = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || requestHeaders.get("x-real-ip") || "unknown";
  return keyedHash(ip, serverEnv.loginThrottleSecret);
}

export const signIn = defineAction(signInSchema, async ({ email, password, next }) => {
  const supabase = await createClient();
  const key = await throttleKey();

  const { data: allowed } = await supabase.rpc("login_allowed", { p_key: key });
  if (allowed === false) throw new ActionError(en.auth.errors.locked);

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    await supabase.rpc("record_login_failure", { p_key: key });
    throw new ActionError(en.auth.errors.invalidCredentials);
  }

  let { data: profile } = await supabase
    .from("profiles")
    .select("id, deactivated_at")
    .eq("id", data.user.id)
    .maybeSingle();

  // First login of the workspace: the configured account becomes owner.
  if (!profile && serverEnv.ownerEmail && email === serverEnv.ownerEmail) {
    const { error: claimError } = await supabase.rpc("claim_ownership", { p_display_name: "" });
    if (!claimError) profile = { id: data.user.id, deactivated_at: null };
  }

  if (!profile || profile.deactivated_at) {
    await supabase.auth.signOut();
    throw new ActionError(en.auth.errors.noAccess);
  }

  redirect(safeNextPath(next));
});

export const signOut = defineAction(z.void(), async () => {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
});

// Always succeeds, so the form does not reveal which emails have accounts.
export const requestPasswordReset = defineAction(requestResetSchema, async ({ email }) => {
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email);
  if (error) console.error("password reset request failed", error.message);
});

export const updatePassword = defineAction(updatePasswordSchema, async ({ tokenHash, password }) => {
  const supabase = await createClient();
  const { error: verifyError } = await supabase.auth.verifyOtp({
    type: "recovery",
    token_hash: tokenHash,
  });
  if (verifyError) {
    // The link is single-use. If a first attempt already signed the user in
    // and then failed on the password, the session is enough to continue.
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new ActionError(en.auth.errors.invalidLink);
  }
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw new ActionError(en.auth.errors.passwordRejected);
  redirect("/");
});

export const acceptInvite = defineAction(
  acceptInviteSchema,
  async ({ invitation, tokenHash, displayName, password }) => {
    const supabase = await createClient();

    const { error: verifyError } = await supabase.auth.verifyOtp({
      type: "invite",
      token_hash: tokenHash,
    });
    if (verifyError) {
      // Same single-use reasoning as in updatePassword().
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new ActionError(en.auth.errors.invalidLink);
    }

    const { error: passwordError } = await supabase.auth.updateUser({ password });
    if (passwordError) throw new ActionError(en.auth.errors.passwordRejected);

    // One transaction: profile, roles, invitation marked accepted.
    const { error } = await supabase.rpc("accept_invitation", {
      p_token: invitation,
      p_display_name: displayName,
    });
    if (error) {
      await supabase.auth.signOut();
      throw new ActionError(en.auth.errors.invitationInvalid);
    }

    redirect("/");
  },
);
