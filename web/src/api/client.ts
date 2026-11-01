/**
 * api/client.ts — the one factory every generated service client uses.
 *
 * It fixes the browser side of the API conventions in docs/02 §4: requests
 * stay same-origin (Caddy in Compose, the ingress in the cluster), the
 * session cookie is sent automatically, and every request carries the CSRF
 * guard header `X-Shotlyst-Client: web` that state-changing endpoints
 * require.
 *
 * It also keeps sessions alive: tokens live 24 h but sessions 30 days, so a
 * 401 from any service is answered by one POST /auth/refresh and a retry of
 * the original request. Concurrent 401s share a single refresh, because the
 * server rotates the token and would reject a second refresh with the old
 * one. If the refresh fails the session is gone and the registered
 * session-expired handler sends the user to the login page.
 */
import createClient, { type Middleware } from "openapi-fetch";

const CSRF_HEADER = "X-Shotlyst-Client";
const AUTH_PREFIX = "/api/v1/auth";
/** Endpoints whose 401 means "wrong credentials / no session", never retried. */
const NO_RETRY = ["/login", "/register", "/refresh", "/logout"].map((p) => AUTH_PREFIX + p);

/** Absolute URL for a same-origin path; Node's fetch (tests) rejects relative ones. */
export function apiUrl(path: string): string {
  return new URL(path, globalThis.location.origin).toString();
}

// fetch is looked up per call (not captured at module load) so tests can
// stub globalThis.fetch.
const doFetch = (input: Request) => globalThis.fetch(input);

let refreshing: Promise<boolean> | null = null;
let onSessionExpired: () => void = () => {};

/** Called once when a refresh fails, i.e. the session is gone for good. */
export function setSessionExpiredHandler(fn: () => void) {
  onSessionExpired = fn;
}

/** POST /auth/refresh, deduplicated across concurrent callers. */
export function refreshSession(): Promise<boolean> {
  refreshing ??= doFetch(
    new Request(apiUrl(`${AUTH_PREFIX}/refresh`), {
      method: "POST",
      credentials: "same-origin",
      headers: { [CSRF_HEADER]: "web" },
    }),
  )
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

// Original requests by openapi-fetch request id; the body of the request
// passed to onResponse has already been consumed, so the retry needs a
// clone taken before sending.
const pending = new Map<string, Request>();

const csrfHeader: Middleware = {
  onRequest({ request }) {
    request.headers.set(CSRF_HEADER, "web");
    return request;
  },
};

const refreshOn401: Middleware = {
  onRequest({ request, id }) {
    if (!NO_RETRY.includes(new URL(request.url).pathname)) {
      pending.set(id, request.clone());
    }
    return request;
  },
  async onResponse({ response, id }) {
    const original = pending.get(id);
    pending.delete(id);
    if (response.status !== 401 || !original) return response;
    if (!(await refreshSession())) {
      onSessionExpired();
      return response;
    }
    return doFetch(original);
  },
  onError({ id }) {
    pending.delete(id);
  },
};

// openapi-fetch constrains `paths` to object types; mirror that here.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export function createApiClient<Paths extends {}>(basePath: string) {
  const client = createClient<Paths>({
    baseUrl: apiUrl(basePath),
    credentials: "same-origin",
    fetch: doFetch,
  });
  client.use(csrfHeader, refreshOn401);
  return client;
}
