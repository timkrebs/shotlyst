import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";
import { getDefaultTimezone } from "@/features/projects/queries";
import { WorkspaceForm } from "@/features/settings/components/workspace-form";
import { timeZones } from "@/lib/format";
import { requireAdminPage } from "@/lib/permissions/guards";
import { en } from "@/messages/en";

export const metadata: Metadata = { title: en.nav.workspace };

export default async function WorkspaceSettingsPage() {
  const { supabase } = await requireAdminPage();
  const defaultTimezone = await getDefaultTimezone(supabase);

  return (
    <>
      <PageHeader title={en.nav.workspace} description={en.settings.description} />
      <WorkspaceForm defaultTimezone={defaultTimezone} timeZones={timeZones()} />
    </>
  );
}
