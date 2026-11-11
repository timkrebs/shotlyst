"use client";

import Link from "next/link";
import type { FormEvent } from "react";

import { FormError, FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAction } from "@/hooks/use-action";
import { en } from "@/messages/en";

import { signIn } from "../actions";

export function LoginForm({ next }: { next?: string }) {
  const { run, pending, error } = useAction(signIn, { inlineError: true });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    run({
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
      next,
    });
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <FormField id="email" label={en.auth.email}>
        <Input id="email" name="email" type="email" autoComplete="email" required autoFocus />
      </FormField>
      <FormField id="password" label={en.auth.password}>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </FormField>
      <FormError message={error} />
      <Button type="submit" disabled={pending}>
        {pending ? en.auth.signingIn : en.auth.signIn}
      </Button>
      <Link
        href="/reset-password"
        className="text-muted-foreground hover:text-foreground text-center text-sm underline-offset-4 hover:underline"
      >
        {en.auth.forgotPassword}
      </Link>
    </form>
  );
}
