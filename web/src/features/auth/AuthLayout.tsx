/**
 * features/auth/AuthLayout.tsx — frame for the login and register screens:
 * the wordmark, a title, the form, and a footer link to the other screen.
 */
import type { ReactNode } from "react";
import { t } from "../../i18n";

interface Props {
  title: string;
  footer: ReactNode;
  children: ReactNode;
}

export function AuthLayout({ title, footer, children }: Props) {
  return (
    <main id="main" className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-5 py-12">
      <p className="mb-10 font-mono text-sm tracking-widest text-muted uppercase">{t("app.name")}</p>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">{title}</h1>
      {children}
      <p className="mt-8 border-t border-line pt-4 text-sm text-muted">{footer}</p>
    </main>
  );
}
