import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";
import { getExportSettings } from "@/features/exports/queries";
import { getDefaultTimezone } from "@/features/projects/queries";
import { ExportLogoForm } from "@/features/settings/components/export-logo-form";
import { WorkspaceForm } from "@/features/settings/components/workspace-form";
import { timeZones } from "@/lib/format";
import { requireAdminPage } from "@/lib/permissions/guards";
import { signedUrls } from "@/lib/storage";
import { en } from "@/messages/en";

export const metadata: Metadata = { title: en.nav.workspace };

export default async function WorkspaceSettingsPage() {
  const { supabase } = await requireAdminPage();
  const [defaultTimezone, exportSettings] = await Promise.all([
    getDefaultTimezone(supabase),
    getExportSettings(supabase),
  ]);
  const urls = await signedUrls(supabase, [exportSettings.logoPath]);

  return (
    <>
      <PageHeader title={en.nav.workspace} description={en.settings.description} />
      <WorkspaceForm
        defaultTimezone={defaultTimezone}
        exportCompany={exportSettings.company ?? ""}
        timeZones={timeZones()}
      />
      <ExportLogoForm
        logoUrl={exportSettings.logoPath ? (urls.get(exportSettings.logoPath) ?? null) : null}
      />
    </>
  );
}
