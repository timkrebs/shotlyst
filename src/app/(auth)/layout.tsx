import type { ReactNode } from "react";

import { en } from "@/messages/en";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="bg-muted/40 flex min-h-dvh flex-col items-center justify-center gap-6 p-6">
      <p className="text-lg font-semibold tracking-tight">{en.app.name}</p>
      <div className="w-full max-w-sm">{children}</div>
    </main>
  );
}
