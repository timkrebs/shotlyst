/**
 * api/client.ts — the one factory every generated service client uses.
 *
 * It fixes the browser side of the API conventions in docs/02 §4: requests
 * stay same-origin (Caddy in Compose, the ingress in the cluster), the
 * session cookie is sent automatically, and every request carries the CSRF
 * guard header `X-Shotlyst-Client: web` that state-changing endpoints
 * require.
 */
import createClient, { type Middleware } from "openapi-fetch";

const csrfHeader: Middleware = {
  onRequest({ request }) {
    request.headers.set("X-Shotlyst-Client", "web");
    return request;
  },
};

// openapi-fetch constrains `paths` to object types; mirror that here.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export function createApiClient<Paths extends {}>(baseUrl: string) {
  const client = createClient<Paths>({ baseUrl, credentials: "same-origin" });
  client.use(csrfHeader);
  return client;
}
