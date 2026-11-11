import type { Metadata } from "next";
import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AcceptInviteForm } from "@/features/auth/components/accept-invite-form";
import { en } from "@/messages/en";

export const metadata: Metadata = { title: en.auth.acceptInvite };

export default async function AcceptInvitePage({ searchParams }: PageProps<"/accept-invite">) {
  const { invitation, token_hash: tokenHash } = await searchParams;
  const valid = typeof invitation === "string" && typeof tokenHash === "string";

  return (
    <Card>
      <CardHeader>
        <CardTitle>{en.auth.acceptInvite}</CardTitle>
        <CardDescription>
          {valid ? en.auth.acceptInviteDescription : en.auth.errors.invalidLink}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {valid ? (
          <AcceptInviteForm invitation={invitation} tokenHash={tokenHash} />
        ) : (
          <Link href="/login" className="text-sm underline underline-offset-4">
            {en.auth.backToSignIn}
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
