"use server";

import { revalidatePath } from "next/cache";

import { ActionError, defineAction } from "@/lib/action";
import { logActivity } from "@/lib/activity";
import { requireAdmin, requireMember } from "@/lib/permissions/guards";
import { en } from "@/messages/en";

import { saveTalentSchema, talentIdSchema } from "./schema";

const FOREIGN_KEY_VIOLATION = "23503";

// Library rules: every member adds talents, the creator or an admin edits
// them, only owner and admin delete. RLS enforces the same.

export const saveTalent = defineAction(saveTalentSchema, async ({ id, values }) => {
  const { supabase, user } = await requireMember();
  const { day_rate, ...rest } = values;
  const row = { ...rest, daily_rate_cents: day_rate };
  const query = id
    ? supabase.from("talents").update(row).eq("id", id)
    : supabase.from("talents").insert({ ...row, created_by: user.id });
  const { data, error } = await query.select("id").maybeSingle();
  if (error || !data) throw new ActionError(en.library.errors.saveFailed);

  await logActivity(supabase, {
    projectId: null,
    action: id ? "talent.updated" : "talent.created",
    entityType: "talent",
    entityId: data.id,
    summary: id
      ? en.talents.activity.updated(values.name)
      : en.talents.activity.created(values.name),
  });
  revalidatePath("/library/talents");
  revalidatePath(`/library/talents/${data.id}`);
});

export const deleteTalent = defineAction(talentIdSchema, async ({ id }) => {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase
    .from("talents")
    .delete()
    .eq("id", id)
    .select("id, name")
    .maybeSingle();
  if (error || !data) {
    // A talent that appears in a shot stays: the cast link restricts deletes.
    throw new ActionError(
      error?.code === FOREIGN_KEY_VIOLATION ? en.talents.errors.inUse : en.library.errors.deleteFailed,
    );
  }
  await logActivity(supabase, {
    projectId: null,
    action: "talent.deleted",
    entityType: "talent",
    entityId: id,
    summary: en.talents.activity.deleted(data.name),
  });
  revalidatePath("/library/talents");
});
