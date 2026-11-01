/**
 * features/auth/session.ts — the signed-in user as server state.
 *
 * The session itself is an HttpOnly cookie the SPA cannot read, so "am I
 * signed in?" is answered by GET /auth/me: a user, or null after a 401
 * (which api/client.ts has already tried to fix with a refresh). The result
 * lives in TanStack Query under ["me"]; login, register and logout write
 * that entry directly so the router guard sees the change immediately.
 */
import { queryOptions, useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { identityApi, type Schemas } from "../../api/identity";
import { unwrap } from "../../api/problem";

export type User = Schemas["User"];

export const meQuery = queryOptions({
  queryKey: ["me"],
  queryFn: async (): Promise<User | null> => {
    const res = await identityApi.GET("/me");
    if (res.response.status === 401) return null;
    return unwrap(res);
  },
  staleTime: 5 * 60_000,
});

/** The current user, or null; fetches /me at most once while fresh. */
export function loadSession(qc: QueryClient): Promise<User | null> {
  return qc.ensureQueryData(meQuery);
}

/** Forget the user and every cached query that belonged to them. */
export function clearSession(qc: QueryClient) {
  qc.removeQueries({ predicate: (q) => q.queryKey[0] !== "me" });
  qc.setQueryData(meQuery.queryKey, null);
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Schemas["LoginRequest"]) => unwrap(await identityApi.POST("/login", { body })),
    onSuccess: (user) => qc.setQueryData(meQuery.queryKey, user),
  });
}

export function useRegister() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Schemas["RegisterRequest"]) => unwrap(await identityApi.POST("/register", { body })),
    onSuccess: (user) => qc.setQueryData(meQuery.queryKey, user),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    // Logout always clears the cookie server-side; a failed call (offline)
    // still signs the user out locally.
    mutationFn: async () => {
      await identityApi.POST("/logout").catch(() => undefined);
    },
    onSettled: () => clearSession(qc),
  });
}
