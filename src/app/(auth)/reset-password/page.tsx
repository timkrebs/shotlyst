import type { Metadata } from "next";
import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NewPasswordForm, RequestResetForm } from "@/features/auth/components/reset-password-forms";
import { en } from "@/messages/en";

export const metadata: Metadata = { title: en.auth.resetPassword };

export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  const { token_hash: tokenHash } = await searchParams;
  const hasToken = typeof tokenHash === "string" && tokenHash.length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{en.auth.resetPassword}</CardTitle>
        <CardDescription>
          {hasToken ? en.auth.newPasswordDescription : en.auth.resetDescription}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {hasToken ? <NewPasswordForm tokenHash={tokenHash} /> : <RequestResetForm />}
        <Link
          href="/login"
          className="text-muted-foreground hover:text-foreground text-center text-sm underline-offset-4 hover:underline"
        >
          {en.auth.backToSignIn}
        </Link>
      </CardContent>
    </Card>
  );
}
