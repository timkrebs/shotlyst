"use server";

import { revalidatePath } from "next/cache";

import { ActionError, defineAction } from "@/lib/action";
import { logActivity } from "@/lib/activity";
import { requireAdmin, requireMember } from "@/lib/permissions/guards";
import { en } from "@/messages/en";

import { libraryIdSchema, saveBrandSchema, saveClientSchema } from "./schema";

const FOREIGN_KEY_VIOLATION = "23503";

// Library rules: every member adds entries, the creator or an admin edits
// them, only owner and admin delete. RLS enforces the same.

export const saveBrand = defineAction(saveBrandSchema, async ({ id, values }) => {
  const { supabase, user } = await requireMember();
  const query = id
    ? supabase.from("brands").update(values).eq("id", id)
    : supabase.from("brands").insert({ ...values, created_by: user.id });
  const { data, error } = await query.select("id").maybeSingle();
  if (error || !data) throw new ActionError(en.library.errors.saveFailed);

  await logActivity(supabase, {
    projectId: null,
    action: id ? "brand.updated" : "brand.created",
    entityType: "brand",
    entityId: data.id,
    summary: id ? en.activity.brandUpdated(values.name) : en.activity.brandCreated(values.name),
  });
  revalidatePath("/library/brands");
});

export const deleteBrand = defineAction(libraryIdSchema, async ({ id }) => {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase
    .from("brands")
    .delete()
    .eq("id", id)
    .select("id, name")
    .maybeSingle();
  if (error || !data) {
    throw new ActionError(
      error?.code === FOREIGN_KEY_VIOLATION
        ? en.library.errors.inUse
        : en.library.errors.deleteFailed,
    );
  }
  await logActivity(supabase, {
    projectId: null,
    action: "brand.deleted",
    entityType: "brand",
    entityId: id,
    summary: en.activity.brandDeleted(data.name),
  });
  revalidatePath("/library/brands");
});

export const saveClient = defineAction(saveClientSchema, async ({ id, values }) => {
  const { supabase, user } = await requireMember();
  const query = id
    ? supabase.from("clients").update(values).eq("id", id)
    : supabase.from("clients").insert({ ...values, created_by: user.id });
  const { data, error } = await query.select("id").maybeSingle();
  if (error || !data) throw new ActionError(en.library.errors.saveFailed);

  await logActivity(supabase, {
    projectId: null,
    action: id ? "client.updated" : "client.created",
    entityType: "client",
    entityId: data.id,
    summary: id ? en.activity.clientUpdated(values.name) : en.activity.clientCreated(values.name),
  });
  revalidatePath("/library/clients");
});

export const deleteClient = defineAction(libraryIdSchema, async ({ id }) => {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase
    .from("clients")
    .delete()
    .eq("id", id)
    .select("id, name")
    .maybeSingle();
  if (error || !data) {
    throw new ActionError(
      error?.code === FOREIGN_KEY_VIOLATION
        ? en.library.errors.inUse
        : en.library.errors.deleteFailed,
    );
  }
  await logActivity(supabase, {
    projectId: null,
    action: "client.deleted",
    entityType: "client",
    entityId: id,
    summary: en.activity.clientDeleted(data.name),
  });
  revalidatePath("/library/clients");
});
