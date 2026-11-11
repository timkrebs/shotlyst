"use client";

import { useState, type FormEvent, type ReactNode } from "react";

import { FormError, FormField } from "@/components/form-field";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAction } from "@/hooks/use-action";
import { en } from "@/messages/en";

import { createProject, updateProject } from "../actions";
import { ASPECT_RATIOS, PROJECT_KINDS, PROJECT_STATUSES } from "../schema";

interface Option {
  id: string;
  name: string;
}

export interface ProjectFormValues {
  id?: string;
  name: string;
  projectNumber: string;
  kind: (typeof PROJECT_KINDS)[number];
  clientId: string | null;
  brandId: string | null;
  aspectRatio: string;
  timezone: string;
  description: string | null;
  status: (typeof PROJECT_STATUSES)[number];
}

// Creates a project, or edits one when `values.id` is set. The project type
// is fixed at creation.
export function ProjectFormDialog({
  trigger,
  values,
  clients,
  brands,
  timeZones,
}: {
  trigger: ReactNode;
  values: ProjectFormValues;
  clients: Option[];
  brands: Option[];
  timeZones: string[];
}) {
  const editing = values.id !== undefined;
  const [open, setOpen] = useState(false);
  const create = useAction(createProject, { inlineError: true });
  const update = useAction(updateProject, {
    inlineError: true,
    successMessage: en.common.saved,
    onSuccess: () => setOpen(false),
  });
  const pending = create.pending || update.pending;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (key: string) => String(form.get(key) ?? "");
    const shared = {
      name: text("name"),
      projectNumber: text("projectNumber"),
      clientId: text("clientId") || null,
      brandId: text("brandId") || null,
      aspectRatio: text("aspectRatio") as (typeof ASPECT_RATIOS)[number],
      timezone: text("timezone"),
      description: text("description"),
    };
    if (values.id) {
      update.run({
        ...shared,
        projectId: values.id,
        status: text("status") as (typeof PROJECT_STATUSES)[number],
      });
    } else {
      create.run({ ...shared, kind: text("kind") as (typeof PROJECT_KINDS)[number] });
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <form onSubmit={onSubmit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{editing ? en.projects.editTitle : en.projects.newTitle}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-[1fr_9rem]">
            <FormField id="project-name" label={en.projects.fields.name}>
              <Input id="project-name" name="name" defaultValue={values.name} required />
            </FormField>
            <FormField id="project-number" label={en.projects.fields.number}>
              <Input
                id="project-number"
                name="projectNumber"
                defaultValue={values.projectNumber}
                required
              />
            </FormField>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {editing ? (
              <FormField id="project-status" label={en.projects.fields.status}>
                <NativeSelect id="project-status" name="status" defaultValue={values.status}>
                  {PROJECT_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {en.projects.status[status]}
                    </option>
                  ))}
                </NativeSelect>
              </FormField>
            ) : (
              <FormField id="project-kind" label={en.projects.fields.kind}>
                <NativeSelect id="project-kind" name="kind" defaultValue={values.kind}>
                  {PROJECT_KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {en.projects.kind[kind]}
                    </option>
                  ))}
                </NativeSelect>
              </FormField>
            )}
            <FormField id="project-aspect" label={en.projects.fields.aspectRatio}>
              <NativeSelect id="project-aspect" name="aspectRatio" defaultValue={values.aspectRatio}>
                {ASPECT_RATIOS.map((ratio) => (
                  <option key={ratio} value={ratio}>
                    {ratio}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField id="project-client" label={en.projects.fields.client}>
              <NativeSelect id="project-client" name="clientId" defaultValue={values.clientId ?? ""}>
                <option value="">{en.common.none}</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField id="project-brand" label={en.projects.fields.brand}>
              <NativeSelect id="project-brand" name="brandId" defaultValue={values.brandId ?? ""}>
                <option value="">{en.common.none}</option>
                {brands.map((brand) => (
                  <option key={brand.id} value={brand.id}>
                    {brand.name}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
          </div>
          <FormField id="project-timezone" label={en.projects.fields.timezone}>
            <NativeSelect id="project-timezone" name="timezone" defaultValue={values.timezone}>
              {timeZones.map((zone) => (
                <option key={zone} value={zone}>
                  {zone}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField id="project-description" label={en.projects.fields.description}>
            <Textarea
              id="project-description"
              name="description"
              rows={3}
              defaultValue={values.description ?? ""}
            />
          </FormField>
          <FormError message={create.error ?? update.error} />
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? en.common.saving : editing ? en.common.save : en.projects.create}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
