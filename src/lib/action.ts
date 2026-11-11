import "server-only";

import { unstable_rethrow } from "next/navigation";
import type { z } from "zod";

import { en } from "@/messages/en";

export type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string };

// An expected failure whose message is safe to show to the user.
export class ActionError extends Error {}

// Wraps a Server Action: validates the input with Zod, turns expected
// failures into a result the client can render, and hides everything else
// behind a generic message.
export function defineAction<S extends z.ZodType, T>(
  schema: S,
  handler: (input: z.output<S>) => Promise<T>,
) {
  return async (raw: z.input<S>): Promise<ActionResult<T>> => {
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? en.errors.invalidInput };
    }
    try {
      return { ok: true, data: await handler(parsed.data) };
    } catch (error) {
      // redirect() and notFound() work by throwing; let them through.
      unstable_rethrow(error);
      if (error instanceof ActionError) return { ok: false, error: error.message };
      console.error(error);
      return { ok: false, error: en.errors.unexpected };
    }
  };
}
