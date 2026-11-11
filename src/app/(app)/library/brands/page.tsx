import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";
import { deleteBrand, saveBrand } from "@/features/library/actions";
import { LibraryTable } from "@/features/library/components/library-table";
import { listBrands } from "@/features/library/queries";
import { requireMemberPage } from "@/lib/permissions/guards";
import { isAdminRole } from "@/lib/permissions/roles";
import { en } from "@/messages/en";

export const metadata: Metadata = { title: en.nav.brands };

export default async function BrandsPage() {
  const { supabase, user, profile } = await requireMemberPage();
  const brands = await listBrands(supabase);

  return (
    <>
      <PageHeader title={en.nav.brands} description={en.library.brands.description} />
      <LibraryTable
        labels={en.library.brands.labels}
        currentUserId={user.id}
        isAdmin={isAdminRole(profile.workspace_role)}
        onSave={saveBrand}
        onDelete={deleteBrand}
        fields={[
          { key: "name", label: en.library.fields.name, type: "text", required: true, column: true },
          { key: "industry", label: en.library.fields.industry, type: "text", column: true },
          { key: "website", label: en.library.fields.website, type: "url", column: true },
          { key: "description", label: en.library.fields.description, type: "textarea" },
          { key: "tone", label: en.library.fields.tone, type: "textarea" },
          { key: "target_audience", label: en.library.fields.targetAudience, type: "textarea" },
          { key: "no_gos", label: en.library.fields.noGos, type: "textarea" },
        ]}
        items={brands.map((brand) => ({
          id: brand.id,
          createdBy: brand.created_by,
          values: {
            name: brand.name,
            industry: brand.industry ?? "",
            website: brand.website ?? "",
            description: brand.description ?? "",
            tone: brand.tone ?? "",
            target_audience: brand.target_audience ?? "",
            no_gos: brand.no_gos ?? "",
          },
        }))}
      />
    </>
  );
}
