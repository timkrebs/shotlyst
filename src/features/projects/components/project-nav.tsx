"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import { en } from "@/messages/en";

const MODULES = [
  { segment: "overview", label: en.projects.nav.overview },
  { segment: "concepts", label: en.projects.nav.concept },
  { segment: "moodboard", label: en.projects.nav.moodboard },
  { segment: "tasks", label: en.projects.nav.tasks },
  { segment: "files", label: en.projects.nav.files },
] as const;

// Navigation inside a project. Later phases add their modules here.
export function ProjectNav({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label={en.projects.nav.label} className="mb-6 flex gap-1 overflow-x-auto border-b">
      {MODULES.map((module) => {
        const href = `/projects/${projectId}/${module.segment}`;
        const active = pathname.startsWith(href);
        return (
          <Link
            key={module.segment}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm",
              active
                ? "border-foreground font-medium"
                : "text-muted-foreground hover:text-foreground border-transparent",
            )}
          >
            {module.label}
          </Link>
        );
      })}
    </nav>
  );
}
