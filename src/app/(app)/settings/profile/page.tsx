import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";
import { ProfileForm } from "@/features/profile/components/profile-form";
import { requireMemberPage } from "@/lib/permissions/guards";
import { signedUrls } from "@/lib/storage";
import { en } from "@/messages/en";

export const metadata: Metadata = { title: en.nav.profile };

export default async function ProfilePage() {
  const { supabase, profile } = await requireMemberPage();

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
    <>
      <PageHeader title={en.nav.profile} description={en.profile.description} />
      <ProfileForm
        displayName={profile.display_name}
        color={profile.color}
        avatarUrl={avatarUrl}
      />
    </>
  );
}
