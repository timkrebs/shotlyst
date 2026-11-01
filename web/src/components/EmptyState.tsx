/**
 * components/EmptyState.tsx — what a list shows when it has nothing yet
 * (docs/05 "Empty states"): one short line, optionally one action.
 */
import type { ReactNode } from "react";

export function EmptyState({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-4 border-t border-dashed border-line py-10 text-muted">
      <p>{children}</p>
      {action}
    </div>
  );
}
