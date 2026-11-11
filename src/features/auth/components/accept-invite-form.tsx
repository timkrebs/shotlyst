"use client";

import type { FormEvent } from "react";

import { FormError, FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAction } from "@/hooks/use-action";
import { en } from "@/messages/en";

import { acceptInvite } from "../actions";
import { PASSWORD_MIN_LENGTH } from "../schema";

export function AcceptInviteForm({
  invitation,
  tokenHash,
}: {
  invitation: string;
  tokenHash: string;
}) {
  const { run, pending, error } = useAction(acceptInvite, { inlineError: true });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    run({
      invitation,
      tokenHash,
      displayName: String(form.get("displayName") ?? ""),
      password: String(form.get("password") ?? ""),
    });
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <FormField id="displayName" label={en.auth.displayName}>
        <Input id="displayName" name="displayName" autoComplete="name" required autoFocus />
      </FormField>
      <FormField id="password" label={en.auth.newPassword} hint={en.auth.passwordHint}>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={PASSWORD_MIN_LENGTH}
          required
        />
      </FormField>
      <FormError message={error} />
      <Button type="submit" disabled={pending}>
        {pending ? en.common.saving : en.auth.joinWorkspace}
      </Button>
    </form>
  );
}
