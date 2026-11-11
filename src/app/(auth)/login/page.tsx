import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForm } from "@/features/auth/components/login-form";
import { getSession } from "@/lib/permissions/guards";
import { safeNextPath } from "@/lib/permissions/routes";
import { en } from "@/messages/en";

export const metadata: Metadata = { title: en.auth.signIn };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  const nextPath = safeNextPath(typeof next === "string" ? next : undefined);

  const session = await getSession();
  if (session?.profile && !session.profile.deactivated_at) redirect(nextPath);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{en.auth.signIn}</CardTitle>
        <CardDescription>
          {session ? en.auth.errors.noAccess : en.auth.signInDescription}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <LoginForm next={nextPath} />
      </CardContent>
    </Card>
  );
}
