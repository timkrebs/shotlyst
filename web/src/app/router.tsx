/**
 * app/router.tsx — the route tree (docs/05 "Routes") and its auth guard.
 *
 * Routes are declared in code rather than generated from files: there are
 * few of them and this keeps the build free of a codegen step. Signed-in
 * screens hang under the pathless `_authed` route, whose beforeLoad loads
 * the session via TanStack Query and redirects to /login?redirect=… when
 * there is none. Routes for later milestones are added here as they ship.
 */
import { createRootRouteWithContext, createRoute, createRouter, redirect, Outlet, type RouterHistory } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import { LoginPage } from "../features/auth/LoginPage";
import { RegisterPage } from "../features/auth/RegisterPage";
import { loadSession } from "../features/auth/session";
import { ProjectsPage } from "../features/projects/ProjectsPage";
import { AppLayout } from "./AppLayout";
import { ErrorView, NotFound } from "./StatusViews";

export interface RouterContext {
  queryClient: QueryClient;
}

/**
 * A post-login target is only followed if it is a path on this origin;
 * anything else (absolute or protocol-relative URLs) would be an open
 * redirect.
 */
export function safeRedirect(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return undefined;
  }
  return value;
}

interface AuthSearch {
  redirect?: string;
  expired?: boolean;
}

function authSearch(search: Record<string, unknown>): AuthSearch {
  const out: AuthSearch = {};
  const target = safeRedirect(search.redirect);
  if (target) out.redirect = target;
  if (search.expired === true || search.expired === "true") out.expired = true;
  return out;
}

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: Outlet,
  notFoundComponent: NotFound,
  errorComponent: ErrorView,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/projects" });
  },
});

// Signed-in users have no business on /login or /register.
async function skipIfSignedIn({ context, search }: { context: RouterContext; search: AuthSearch }) {
  if (await loadSession(context.queryClient)) {
    throw redirect({ href: search.redirect ?? "/projects" });
  }
}

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  validateSearch: authSearch,
  beforeLoad: skipIfSignedIn,
  component: LoginPage,
});

const registerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/register",
  validateSearch: authSearch,
  beforeLoad: skipIfSignedIn,
  component: RegisterPage,
});

const authedRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "_authed",
  beforeLoad: async ({ context, location }) => {
    const user = await loadSession(context.queryClient);
    if (!user) {
      throw redirect({ to: "/login", search: { redirect: location.href } });
    }
    return { user };
  },
  component: AppLayout,
});

const projectsRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: "/projects",
  component: ProjectsPage,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  registerRoute,
  authedRoute.addChildren([projectsRoute]),
]);

export function createAppRouter(queryClient: QueryClient, history?: RouterHistory) {
  return createRouter({
    routeTree,
    context: { queryClient },
    ...(history ? { history } : {}),
    defaultPreload: "intent",
    // Data freshness is TanStack Query's job; the router should always ask it.
    defaultPreloadStaleTime: 0,
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
