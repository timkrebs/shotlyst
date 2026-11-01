/**
 * features/auth/RegisterPage.tsx — /register. Creating an account also
 * signs in (identity sets the session cookie), so success goes straight to
 * the redirect target or /projects.
 */
import { useState, type FormEvent } from "react";
import { Link, getRouteApi, useNavigate } from "@tanstack/react-router";
import { Button } from "../../components/Button";
import { TextField } from "../../components/TextField";
import { t } from "../../i18n";
import { AuthLayout } from "./AuthLayout";
import { FormAlert } from "./FormAlert";
import { formErrors } from "./errors";
import { useRegister } from "./session";

const route = getRouteApi("/register");

export function RegisterPage() {
  const search = route.useSearch();
  const navigate = useNavigate();
  const register = useRegister();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");

  const errors = register.isError
    ? formErrors(register.error, { 409: { fields: { email: t("auth.register.emailTaken") } } })
    : { fields: {} as Record<string, string> };

  function submit(e: FormEvent) {
    e.preventDefault();
    register.mutate(
      { email, password, display_name: displayName },
      { onSuccess: () => void navigate({ href: search.redirect ?? "/projects", replace: true }) },
    );
  }

  return (
    <AuthLayout
      title={t("auth.register.title")}
      footer={
        <>
          {t("auth.register.haveAccount")}{" "}
          <Link to="/login" search={search.redirect ? { redirect: search.redirect } : {}} className="text-fg underline underline-offset-4">
            {t("auth.register.toLogin")}
          </Link>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-5">
        {errors.form && <FormAlert>{errors.form}</FormAlert>}
        <TextField
          label={t("auth.displayName")}
          autoComplete="name"
          required
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          error={errors.fields.display_name}
        />
        <TextField
          label={t("auth.email")}
          type="email"
          autoComplete="username"
          inputMode="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={errors.fields.email}
        />
        <TextField
          label={t("auth.password")}
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          hint={t("auth.passwordHint")}
          error={errors.fields.password}
        />
        <Button type="submit" pending={register.isPending} className="mt-2">
          {register.isPending ? t("common.working") : t("auth.register.submit")}
        </Button>
      </form>
    </AuthLayout>
  );
}
