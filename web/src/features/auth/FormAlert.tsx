/**
 * features/auth/FormAlert.tsx — a message about the whole form (wrong
 * credentials, offline, session ended), announced to screen readers.
 */
import type { ReactNode } from "react";

export function FormAlert({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="border-l-2 border-danger py-1 pl-3 text-sm text-fg">
      {children}
    </p>
  );
}
