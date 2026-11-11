"use client";

import {
  Building2,
  Drama,
  FolderKanban,
  House,
  Settings,
  Sparkles,
  User,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import { en } from "@/messages/en";

interface NavItem {
  href: string;
  label: string;
  icon: typeof FolderKanban;
  adminOnly?: boolean;
}

const SECTIONS: { title: string | null; items: NavItem[] }[] = [
  {
    title: null,
    items: [
      { href: "/", label: en.nav.home, icon: House },
      { href: "/projects", label: en.nav.projects, icon: FolderKanban },
    ],
  },
  {
    title: en.nav.library,
    items: [
      { href: "/library/talents", label: en.nav.talents, icon: Drama },
      { href: "/library/brands", label: en.nav.brands, icon: Sparkles },
      { href: "/library/clients", label: en.nav.clients, icon: Building2 },
    ],
  },
  {
    title: en.nav.settings,
    items: [
      { href: "/settings/members", label: en.nav.members, icon: Users, adminOnly: true },
      { href: "/settings/workspace", label: en.nav.workspace, icon: Settings, adminOnly: true },
      { href: "/settings/profile", label: en.nav.profile, icon: User },
    ],
  },
];

// Global navigation. Members see only what their role allows; the pages
// behind the hidden links reject them as well.
export function AppNav({ isAdmin, orientation }: { isAdmin: boolean; orientation: "side" | "top" }) {
  const pathname = usePathname();
  const side = orientation === "side";

  return (
    <nav
      aria-label={en.nav.main}
      className={side ? "grid gap-6" : "flex items-center gap-1 overflow-x-auto"}
    >
      {SECTIONS.map((section) => {
        const items = section.items.filter((item) => isAdmin || !item.adminOnly);
        return (
          <div key={section.title ?? "main"} className={side ? "grid gap-1" : "contents"}>
            {side && section.title ? (
              <p className="text-muted-foreground px-2 text-xs font-medium tracking-wide uppercase">
                {section.title}
              </p>
            ) : null}
            {items.map((item) => {
              const active =
                pathname === item.href ||
                (item.href !== "/" && pathname.startsWith(`${item.href}/`));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "hover:bg-accent flex items-center gap-2 rounded-md px-2 py-1.5 text-sm whitespace-nowrap",
                    active ? "bg-accent font-medium" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <item.icon className="size-4" aria-hidden />
                  {item.label}
                </Link>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}
