"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import { toast } from "sonner";

import type { ActionResult } from "@/lib/action-types";

interface Options<T> {
  onSuccess?: (data: T) => void;
  successMessage?: string;
  // Show failures inline (through `error`) instead of as a toast.
  inlineError?: boolean;
}

// Runs a Server Action in a transition, reports the outcome and refreshes the
// server-rendered data.
export function useAction<I, T>(
  action: (input: I) => Promise<ActionResult<T>>,
  options: Options<T> = {},
) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const { onSuccess, successMessage, inlineError } = options;

  const run = useCallback(
    (input: I) => {
      startTransition(async () => {
        setError(null);
        const result = await action(input);
        // An action that redirects never returns a result.
        if (!result) return;
        if (result.ok) {
          if (successMessage) toast.success(successMessage);
          router.refresh();
          onSuccess?.(result.data);
        } else {
          setError(result.error);
          if (!inlineError) toast.error(result.error);
        }
      });
    },
    [action, inlineError, onSuccess, router, successMessage],
  );

  return { run, pending, error };
}
