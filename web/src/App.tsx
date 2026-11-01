/**
 * App.tsx — application root: query client, router, theme, and the reaction
 * to a session that could not be refreshed.
 *
 * Both clients are created per App instance (not as module singletons) so
 * tests can mount an isolated app with a memory history.
 */
import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, type RouterHistory } from "@tanstack/react-router";
import { setSessionExpiredHandler } from "./api/client";
import { ApiError } from "./api/problem";
import { createAppRouter } from "./app/router";
import { useApplyTheme } from "./app/theme";
import { clearSession, meQuery } from "./features/auth/session";

function newQueryClient() {
  return new QueryClient({
    defaultOptions: {
      // 4xx answers will not change on retry; the client already retried 401 via refresh.
      queries: { retry: (n, err) => n < 2 && !(err instanceof ApiError) },
    },
  });
}

export function App({ history }: { history?: RouterHistory }) {
  const [queryClient] = useState(newQueryClient);
  const [router] = useState(() => createAppRouter(queryClient, history));
  useApplyTheme();

  useEffect(() => {
    setSessionExpiredHandler(() => {
      // Only a user we knew about can "expire"; an anonymous 401 is normal.
      if (!queryClient.getQueryData(meQuery.queryKey)) return;
      clearSession(queryClient);
      void router.navigate({ to: "/login", search: { redirect: router.state.location.href, expired: true } });
    });
    return () => setSessionExpiredHandler(() => {});
  }, [queryClient, router]);

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
