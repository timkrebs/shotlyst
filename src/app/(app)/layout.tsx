import Link from "next/link";
import type { ReactNode } from "react";

import { AppNav } from "@/components/app-nav";
import { UserMenu } from "@/components/user-menu";
import { requireMemberPage } from "@/lib/permissions/guards";
import { isAdminRole } from "@/lib/permissions/roles";
import { signedUrls } from "@/lib/storage";
import { en } from "@/messages/en";

// Everything behind the login. The proxy already redirects requests without a
// session; this layout also rejects accounts without an active profile.
export default async function AppLayout({ children }: { children: ReactNode }) {
  const { supabase, user, profile } = await requireMemberPage();
  const isAdmin = isAdminRole(profile.workspace_role);

  let avatarUrl: string | null = null;
  if (profile.avatar_file_id) {
    const { data: file } = await supabase
      .from("files")
      .select("path")
      .eq("id", profile.avatar_file_id)
      .maybeSingle();
    if (file) avatarUrl = (await signedUrls(supabase, [file.path])).get(file.path) ?? null;
  }

  return (
    <div className="flex min-h-dvh">
      <aside className="bg-muted/30 hidden w-56 shrink-0 flex-col gap-6 border-r p-4 md:flex">
        <Link href="/" className="px-2 text-base font-semibold tracking-tight">
          {en.app.name}
        </Link>
        <AppNav isAdmin={isAdmin} orientation="side" />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-3 border-b px-4">
          <Link href="/" className="font-semibold tracking-tight md:hidden">
            {en.app.name}
          </Link>
          <div className="min-w-0 flex-1 md:hidden">
            <AppNav isAdmin={isAdmin} orientation="top" />
          </div>
          <div className="ml-auto">
            <UserMenu
              name={profile.display_name}
              email={user.email ?? ""}
              color={profile.color}
              avatarUrl={avatarUrl}
            />
          </div>
        </header>
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
