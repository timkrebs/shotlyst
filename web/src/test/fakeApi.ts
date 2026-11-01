/**
 * test/fakeApi.ts — a stub for globalThis.fetch that answers by
 * "METHOD /path" and records every request, so tests exercise the real
 * generated clients and middleware without a server.
 */
import { vi } from "vitest";

type Handler = (req: Request) => Response | Promise<Response>;

export function json(status: number, body?: unknown): Response {
  if (body === undefined) return new Response(null, { status });
  const type = status >= 400 ? "application/problem+json" : "application/json";
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": type } });
}

/** Installs the stub; unknown routes answer 404. Returns the call log. */
export function fakeApi(routes: Record<string, Handler | Response>) {
  const calls: Request[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (req: Request) => {
      calls.push(req);
      const route = routes[`${req.method} ${new URL(req.url).pathname}`];
      if (!route) return json(404, { title: "Not Found", status: 404 });
      return typeof route === "function" ? route(req) : route.clone();
    }),
  );
  return {
    calls,
    count: (method: string, path: string) =>
      calls.filter((r) => r.method === method && new URL(r.url).pathname === path).length,
  };
}

export const testUser = {
  id: "0b6f6c56-5d27-4c2b-9d4c-0c1f8a2b9e10",
  email: "kim@example.com",
  display_name: "Kim",
  locale: "en",
  updated_at: "2026-11-01T10:00:00Z",
};
