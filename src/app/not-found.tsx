import Link from "next/link";

import { en } from "@/messages/en";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-xl font-semibold">{en.errors.notFoundTitle}</h1>
      <p className="text-muted-foreground text-sm">{en.errors.notFoundDescription}</p>
      <Link href="/projects" className="text-sm underline underline-offset-4">
        {en.nav.backToProjects}
      </Link>
    </main>
  );
}
