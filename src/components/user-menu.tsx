"use client";

import { LogOut, Moon, Sun, User } from "lucide-react";
import Link from "next/link";
import { useTheme } from "next-themes";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserAvatar } from "@/components/user-avatar";
import { signOut } from "@/features/auth/actions";
import { useAction } from "@/hooks/use-action";
import { en } from "@/messages/en";

export function UserMenu({
  name,
  email,
  color,
  avatarUrl,
}: {
  name: string;
  email: string;
  color: string;
  avatarUrl: string | null;
}) {
  const { resolvedTheme, setTheme } = useTheme();
  const { run } = useAction(signOut);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={en.nav.account}
        className="focus-visible:ring-ring/50 rounded-full outline-none focus-visible:ring-[3px]"
      >
        <UserAvatar name={name} color={color} url={avatarUrl} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <p className="truncate">{name}</p>
          <p className="text-muted-foreground truncate text-xs font-normal">{email}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings/profile">
            <User />
            {en.nav.profile}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault();
            setTheme(resolvedTheme === "dark" ? "light" : "dark");
          }}
        >
          <Sun className="dark:hidden" />
          <Moon className="hidden dark:block" />
          {en.nav.toggleTheme}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => run()}>
          <LogOut />
          {en.auth.signOut}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
