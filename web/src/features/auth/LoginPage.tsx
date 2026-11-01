/**
 * features/auth/LoginPage.tsx — /login. On success the user lands where
 * they were sent from (`?redirect=`, same-origin paths only) or on
 * /projects. `?expired` explains why a signed-in user ended up here.
 */
import { useState, type FormEvent } from "react";
import { Link, getRouteApi, useNavigate } from "@tanstack/react-router";
import { Button } from "../../components/Button";
import { TextField } from "../../components/TextField";
import { t } from "../../i18n";
import { AuthLayout } from "./AuthLayout";
import { FormAlert } from "./FormAlert";
import { formErrors } from "./errors";
import { useLogin } from "./session";

const route = getRouteApi("/login");

export function LoginPage() {
  const search = route.useSearch();
  const navigate = useNavigate();
  const login = useLogin();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const errors = login.isError
    ? formErrors(login.error, { 401: { form: t("auth.login.invalid"), fields: {} } })
    : { fields: {} as Record<string, string> };
  const notice = errors.form ?? (search.expired ? t("auth.expired") : undefined);

  function submit(e: FormEvent) {
    e.preventDefault();
    login.mutate(
      { email, password },
      { onSuccess: () => void navigate({ href: search.redirect ?? "/projects", replace: true }) },
    );
  }

  return (
    <AuthLayout
      title={t("auth.login.title")}
      footer={
        <>
          {t("auth.login.noAccount")}{" "}
          <Link to="/register" search={search.redirect ? { redirect: search.redirect } : {}} className="text-fg underline underline-offset-4">
            {t("auth.login.toRegister")}
          </Link>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-5">
        {notice && <FormAlert>{notice}</FormAlert>}
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
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.fields.password}
        />
        <Button type="submit" pending={login.isPending} className="mt-2">
          {login.isPending ? t("common.working") : t("auth.login.submit")}
        </Button>
      </form>
    </AuthLayout>
  );
}
