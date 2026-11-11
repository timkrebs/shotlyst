import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";
import { LibraryTable } from "@/features/library/components/library-table";
import { deleteTalent, saveTalent } from "@/features/talents/actions";
import { listTalents } from "@/features/talents/queries";
import { formatDayRate, TALENT_TYPES } from "@/features/talents/schema";
import { requireMemberPage } from "@/lib/permissions/guards";
import { isAdminRole } from "@/lib/permissions/roles";
import { en } from "@/messages/en";

export const metadata: Metadata = { title: en.nav.talents };

export default async function TalentsPage() {
  const { supabase, user, profile } = await requireMemberPage();
  const talents = await listTalents(supabase);
  const fields = en.talents.fields;

  return (
    <>
      <PageHeader title={en.nav.talents} description={en.talents.description} />
      <LibraryTable
        labels={en.talents.labels}
        currentUserId={user.id}
        isAdmin={isAdminRole(profile.workspace_role)}
        detailPath="/library/talents"
        onSave={saveTalent}
        onDelete={deleteTalent}
        fields={[
          { key: "name", label: fields.name, type: "text", required: true, column: true },
          {
            key: "type",
            label: fields.type,
            type: "select",
            required: true,
            column: true,
            options: TALENT_TYPES.map((type) => ({ value: type, label: en.talents.type[type] })),
          },
          { key: "description", label: fields.description, type: "textarea" },
          { key: "birth_date", label: fields.birthDate, type: "date" },
          {
            key: "languages",
            label: fields.languages,
            type: "text",
            hint: en.talents.listHint,
            column: true,
          },
          { key: "residence", label: fields.residence, type: "text", column: true },
          { key: "contact", label: fields.contact, type: "textarea" },
          {
            key: "day_rate",
            label: fields.dayRate,
            type: "number",
            step: "0.01",
            hint: en.talents.dayRateHint,
            column: true,
          },
          { key: "tags", label: fields.tags, type: "text", hint: en.talents.listHint, column: true },
        ]}
        items={talents.map((talent) => ({
          id: talent.id,
          createdBy: talent.created_by,
          values: {
            name: talent.name,
            type: talent.type,
            description: talent.description ?? "",
            birth_date: talent.birth_date ?? "",
            languages: talent.languages.join(", "),
            residence: talent.residence ?? "",
            contact: talent.contact ?? "",
            day_rate: formatDayRate(talent.daily_rate_cents),
            tags: talent.tags.join(", "),
          },
        }))}
      />
    </>
  );
}
