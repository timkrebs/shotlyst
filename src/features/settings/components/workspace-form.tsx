"use client";

import type { FormEvent } from "react";

import { FormError, FormField } from "@/components/form-field";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAction } from "@/hooks/use-action";
import { en } from "@/messages/en";

import { saveWorkspaceSettings } from "../actions";

export function WorkspaceForm({
  defaultTimezone,
  exportCompany,
  timeZones,
}: {
  defaultTimezone: string;
  exportCompany: string;
  timeZones: string[];
}) {
  const save = useAction(saveWorkspaceSettings, {
    inlineError: true,
    successMessage: en.common.saved,
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    save.run({
      defaultTimezone: String(form.get("defaultTimezone") ?? ""),
      exportCompany: String(form.get("exportCompany") ?? ""),
    });
  }

  return (
    <form onSubmit={onSubmit} className="grid max-w-md gap-4">
      <FormField
        id="defaultTimezone"
        label={en.settings.defaultTimezone}
        hint={en.settings.defaultTimezoneHint}
      >
        <NativeSelect id="defaultTimezone" name="defaultTimezone" defaultValue={defaultTimezone}>
          {timeZones.map((zone) => (
            <option key={zone} value={zone}>
              {zone}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      <FormField
        id="exportCompany"
        label={en.settings.exportCompany}
        hint={en.settings.exportCompanyHint}
      >
        <Input id="exportCompany" name="exportCompany" maxLength={200} defaultValue={exportCompany} />
      </FormField>
      <FormError message={save.error} />
      <div>
        <Button type="submit" disabled={save.pending}>
          {save.pending ? en.common.saving : en.common.save}
        </Button>
      </div>
    </form>
  );
}
