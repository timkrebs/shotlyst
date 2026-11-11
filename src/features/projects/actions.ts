"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { ActionError, defineAction } from "@/lib/action";
import { logActivity } from "@/lib/activity";
import { MEDIA_BUCKET } from "@/lib/files";
import { requireMember, requireProjectRole } from "@/lib/permissions/guards";
import { en } from "@/messages/en";

import {
  archiveProjectSchema,
  createProjectSchema,
  duplicateProjectSchema,
  projectIdSchema,
  projectMemberSchema,
  removeProjectMemberSchema,
  setCoverSchema,
  updateProjectSchema,
} from "./schema";

const UNIQUE_VIOLATION = "23505";

export const createProject = defineAction(createProjectSchema, async (input) => {
  const { supabase, user } = await requireMember();
  // The ID is chosen here because the insert cannot return the row: the
  // creator becomes a member in an AFTER trigger, and only members may read.
  const id = randomUUID();
  const { error } = await supabase.from("projects").insert({
    id,
    name: input.name,
    project_number: input.projectNumber,
    kind: input.kind,
    client_id: input.clientId,
    brand_id: input.brandId,
    aspect_ratio: input.aspectRatio,
    timezone: input.timezone,
    description: input.description,
    created_by: user.id,
  });
  if (error) {
    throw new ActionError(
      error.code === UNIQUE_VIOLATION
        ? en.projects.errors.numberTaken
        : en.projects.errors.createFailed,
    );
  }

  await logActivity(supabase, {
    projectId: id,
    action: "project.created",
    entityType: "project",
    entityId: id,
    summary: en.activity.projectCreated(input.name),
  });
  revalidatePath("/projects");
  redirect(`/projects/${id}/overview`);
});

export const updateProject = defineAction(updateProjectSchema, async (input) => {
  const { supabase } = await requireProjectRole(input.projectId, "editor");
  const { data, error } = await supabase
    .from("projects")
    .update({
      name: input.name,
      project_number: input.projectNumber,
      client_id: input.clientId,
      brand_id: input.brandId,
      aspect_ratio: input.aspectRatio,
      timezone: input.timezone,
      description: input.description,
      status: input.status,
    })
    .eq("id", input.projectId)
    .select("id")
    .maybeSingle();
  if (error || !data) {
    throw new ActionError(
      error?.code === UNIQUE_VIOLATION
        ? en.projects.errors.numberTaken
        : en.projects.errors.updateFailed,
    );
  }

  await logActivity(supabase, {
    projectId: input.projectId,
    action: "project.updated",
    entityType: "project",
    entityId: input.projectId,
    summary: en.activity.projectUpdated,
  });
  revalidatePath(`/projects/${input.projectId}`, "layout");
  revalidatePath("/projects");
});

export const setProjectArchived = defineAction(
  archiveProjectSchema,
  async ({ projectId, archived }) => {
    const { supabase } = await requireProjectRole(projectId, "editor");
    const { data, error } = await supabase
      .from("projects")
      .update({ archived_at: archived ? new Date().toISOString() : null })
      .eq("id", projectId)
      .select("id")
      .maybeSingle();
    if (error || !data) throw new ActionError(en.projects.errors.updateFailed);

    await logActivity(supabase, {
      projectId,
      action: archived ? "project.archived" : "project.unarchived",
      entityType: "project",
      entityId: projectId,
      summary: archived ? en.activity.projectArchived : en.activity.projectUnarchived,
    });
    revalidatePath(`/projects/${projectId}`, "layout");
    revalidatePath("/projects");
  },
);

export const deleteProject = defineAction(projectIdSchema, async ({ projectId }) => {
  const { supabase } = await requireProjectRole(projectId, "editor");
  const { data: project } = await supabase
    .from("projects")
    .select("name")
    .eq("id", projectId)
    .maybeSingle();
  if (!project) throw new ActionError(en.errors.notFound);

  // Rows cascade in the database; the stored objects have to go first.
  const { data: files } = await supabase.from("files").select("path").eq("project_id", projectId);
  if (files && files.length > 0) {
    const { error: storageError } = await supabase.storage
      .from(MEDIA_BUCKET)
      .remove(files.map((file) => file.path));
    if (storageError) throw new ActionError(en.projects.errors.deleteFailed);
  }

  const { data, error } = await supabase
    .from("projects")
    .delete()
    .eq("id", projectId)
    .select("id")
    .maybeSingle();
  if (error || !data) throw new ActionError(en.projects.errors.deleteFailed);

  await logActivity(supabase, {
    projectId: null,
    action: "project.deleted",
    entityType: "project",
    entityId: projectId,
    summary: en.activity.projectDeleted(project.name),
  });
  revalidatePath("/projects");
  redirect("/projects");
});

// Copies a project's structure and shots into a new project. Reading the
// source is enough; the caller becomes editor of the copy.
export const duplicateProject = defineAction(duplicateProjectSchema, async (input) => {
  const { supabase } = await requireProjectRole(input.projectId, "viewer");
  const { data: newId, error } = await supabase.rpc("duplicate_project", {
    p_project_id: input.projectId,
    p_name: input.name,
    p_project_number: input.projectNumber,
  });
  if (error || !newId) {
    throw new ActionError(
      error?.code === UNIQUE_VIOLATION
        ? en.projects.errors.numberTaken
        : en.projects.errors.createFailed,
    );
  }

  await logActivity(supabase, {
    projectId: newId,
    action: "project.duplicated",
    entityType: "project",
    entityId: newId,
    summary: en.activity.projectDuplicated(input.name),
  });
  revalidatePath("/projects");
  redirect(`/projects/${newId}/overview`);
});

export const setProjectCover = defineAction(setCoverSchema, async ({ projectId, fileId }) => {
  const { supabase } = await requireProjectRole(projectId, "editor");
  if (fileId) {
    const { data: file } = await supabase
      .from("files")
      .select("id")
      .eq("id", fileId)
      .eq("project_id", projectId)
      .eq("kind", "image")
      .maybeSingle();
    if (!file) throw new ActionError(en.errors.notFound);
  }
  const { data, error } = await supabase
    .from("projects")
    .update({ cover_file_id: fileId })
    .eq("id", projectId)
    .select("id")
    .maybeSingle();
  if (error || !data) throw new ActionError(en.projects.errors.updateFailed);

  await logActivity(supabase, {
    projectId,
    action: "project.cover_changed",
    entityType: "project",
    entityId: projectId,
    summary: en.activity.coverChanged,
  });
  revalidatePath(`/projects/${projectId}`, "layout");
  revalidatePath("/projects");
});

export const addProjectMember = defineAction(
  projectMemberSchema,
  async ({ projectId, userId, role }) => {
    const { supabase, user } = await requireProjectRole(projectId, "editor");
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", userId)
      .is("deactivated_at", null)
      .maybeSingle();
    if (!profile) throw new ActionError(en.errors.notFound);

    const { error } = await supabase
      .from("project_members")
      .insert({ project_id: projectId, user_id: userId, role, added_by: user.id });
    if (error) {
      throw new ActionError(
        error.code === UNIQUE_VIOLATION
          ? en.projects.errors.alreadyInProject
          : en.projects.errors.memberChangeFailed,
      );
    }

    await logActivity(supabase, {
      projectId,
      action: "project_member.added",
      entityType: "profile",
      entityId: userId,
      summary: en.activity.memberAdded(profile.display_name, en.roles.project[role]),
    });
    revalidatePath(`/projects/${projectId}`, "layout");
  },
);

export const changeProjectMemberRole = defineAction(
  projectMemberSchema,
  async ({ projectId, userId, role }) => {
    const { supabase } = await requireProjectRole(projectId, "editor");
    const { data, error } = await supabase
      .from("project_members")
      .update({ role })
      .eq("project_id", projectId)
      .eq("user_id", userId)
      .select("id, profile:profiles!project_members_user_id_fkey(display_name)")
      .maybeSingle();
    if (error || !data) throw new ActionError(en.projects.errors.memberChangeFailed);

    await logActivity(supabase, {
      projectId,
      action: "project_member.role_changed",
      entityType: "profile",
      entityId: userId,
      summary: en.activity.roleChanged(data.profile.display_name, en.roles.project[role]),
    });
    revalidatePath(`/projects/${projectId}`, "layout");
  },
);

export const removeProjectMember = defineAction(
  removeProjectMemberSchema,
  async ({ projectId, userId }) => {
    const { supabase } = await requireProjectRole(projectId, "editor");
    const { data, error } = await supabase
      .from("project_members")
      .delete()
      .eq("project_id", projectId)
      .eq("user_id", userId)
      .select("id, profile:profiles!project_members_user_id_fkey(display_name)")
      .maybeSingle();
    if (error || !data) throw new ActionError(en.projects.errors.memberChangeFailed);

    await logActivity(supabase, {
      projectId,
      action: "project_member.removed",
      entityType: "profile",
      entityId: userId,
      summary: en.activity.memberRemoved(data.profile.display_name),
    });
    revalidatePath(`/projects/${projectId}`, "layout");
  },
);
