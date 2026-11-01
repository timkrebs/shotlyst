/**
 * api/problem.ts — turns a failed openapi-fetch call into an ApiError.
 *
 * Every service answers errors with application/problem+json (docs/04), so
 * one error type covers them all. Query and mutation functions throw it;
 * screens branch on `status` and show `fieldErrors` next to inputs.
 */
import type { components } from "./identity/schema";

export type Problem = components["schemas"]["Problem"];

/** A non-2xx API response, with the problem body when the server sent one. */
export class ApiError extends Error {
  readonly status: number;
  readonly problem: Problem | undefined;

  constructor(status: number, problem?: Problem) {
    super(problem?.detail ?? problem?.title ?? `HTTP ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.problem = problem;
  }

  /** Validation messages by field name (422), for display next to inputs. */
  get fieldErrors(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const e of this.problem?.errors ?? []) {
      if (e.field && e.message && !(e.field in out)) out[e.field] = e.message;
    }
    return out;
  }
}

/**
 * The data of a successful openapi-fetch result; throws ApiError otherwise.
 * `error` is the parsed problem body for documented error responses.
 */
export function unwrap<T>(result: { data?: T; error?: unknown; response: Response }): T {
  if (result.response.ok && result.data !== undefined) return result.data;
  throw new ApiError(result.response.status, result.error as Problem | undefined);
}
