/**
 * app/AppLayout.tsx — frame for every signed-in plan-mode screen: a thin
 * header (wordmark, navigation, theme, logout) above the routed page.
 * Shoot mode will not use this layout (docs/05: full-screen, dark only).
 */
import { Link, Outlet, getRouteApi, useNavigate } from "@tanstack/react-router";
import { Button } from "../components/Button";
import { SegmentedControl } from "../components/SegmentedControl";
import { useLogout } from "../features/auth/session";
import { t } from "../i18n";
import { useThemeStore, type ThemePreference } from "./theme";

const route = getRouteApi("/_authed");

const themes: readonly { value: ThemePreference; label: string }[] = [
  { value: "system", label: t("theme.system") },
  { value: "light", label: t("theme.light") },
  { value: "dark", label: t("theme.dark") },
];

export function AppLayout() {
  const { user } = route.useRouteContext();
  const navigate = useNavigate();
  const logout = useLogout();
  const { preference, setPreference } = useThemeStore();

  return (
    <div className="min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:p-2">
        {t("app.skipToContent")}
      </a>
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3">
          <Link to="/projects" className="font-mono text-sm tracking-widest uppercase">
            {t("app.name")}
          </Link>
          <nav className="text-sm">
            <Link to="/projects" className="text-muted hover:text-fg [&.active]:text-fg">
              {t("nav.projects")}
            </Link>
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <SegmentedControl label={t("theme.label")} options={themes} value={preference} onChange={setPreference} />
            <span className="hidden text-sm text-muted sm:inline">{t("nav.signedInAs", { name: user.display_name })}</span>
            <Button
              variant="quiet"
              pending={logout.isPending}
              onClick={() => logout.mutate(undefined, { onSettled: () => void navigate({ to: "/login" }) })}
            >
              {t("nav.logout")}
            </Button>
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-5xl px-5 py-8">
        <Outlet />
      </main>
    </div>
  );
}
