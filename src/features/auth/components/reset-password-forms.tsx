"use client";

import { useState, type FormEvent } from "react";

import { FormError, FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAction } from "@/hooks/use-action";
import { en } from "@/messages/en";

import { requestPasswordReset, updatePassword } from "../actions";
import { PASSWORD_MIN_LENGTH } from "../schema";

export function RequestResetForm() {
  const [sent, setSent] = useState(false);
  const { run, pending, error } = useAction(requestPasswordReset, {
    inlineError: true,
    onSuccess: () => setSent(true),
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    run({ email: String(form.get("email") ?? "") });
  }

  if (sent) return <p className="text-sm">{en.auth.resetSent}</p>;

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <FormField id="email" label={en.auth.email}>
        <Input id="email" name="email" type="email" autoComplete="email" required autoFocus />
      </FormField>
      <FormError message={error} />
      <Button type="submit" disabled={pending}>
        {en.auth.sendResetLink}
      </Button>
    </form>
  );
}

export function NewPasswordForm({ tokenHash }: { tokenHash: string }) {
  const { run, pending, error } = useAction(updatePassword, { inlineError: true });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    run({ tokenHash, password: String(form.get("password") ?? "") });
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <FormField id="password" label={en.auth.newPassword} hint={en.auth.passwordHint}>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={PASSWORD_MIN_LENGTH}
          required
          autoFocus
        />
      </FormField>
      <FormError message={error} />
      <Button type="submit" disabled={pending}>
        {pending ? en.common.saving : en.auth.savePassword}
      </Button>
    </form>
  );
}
