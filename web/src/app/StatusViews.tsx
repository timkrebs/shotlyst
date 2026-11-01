/**
 * app/StatusViews.tsx — full-page fallbacks the router renders: unknown
 * paths, and loader/guard failures (typically: API unreachable).
 */
import type { ReactNode } from "react";
import { Link, useRouter } from "@tanstack/react-router";
import { Button } from "../components/Button";
import { t } from "../i18n";

function Frame({ children }: { children: ReactNode }) {
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-4 px-5">
      <p className="font-mono text-sm tracking-widest text-muted uppercase">{t("app.name")}</p>
      {children}
    </main>
  );
}

export function NotFound() {
  return (
    <Frame>
      <h1 className="text-xl font-semibold">{t("errors.notFound")}</h1>
      <Link to="/projects" className="underline underline-offset-4">
        {t("errors.toHome")}
      </Link>
    </Frame>
  );
}

export function ErrorView() {
  const router = useRouter();
  return (
    <Frame>
      <h1 role="alert" className="text-xl font-semibold">
        {t("errors.network")}
      </h1>
      <div>
        <Button onClick={() => void router.invalidate()}>{t("common.retry")}</Button>
      </div>
    </Frame>
  );
}
