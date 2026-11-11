import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";
import { deleteClient, saveClient } from "@/features/library/actions";
import { LibraryTable } from "@/features/library/components/library-table";
import { listClients } from "@/features/library/queries";
import { requireMemberPage } from "@/lib/permissions/guards";
import { isAdminRole } from "@/lib/permissions/roles";
import { en } from "@/messages/en";

export const metadata: Metadata = { title: en.nav.clients };

export default async function ClientsPage() {
  const { supabase, user, profile } = await requireMemberPage();
  const clients = await listClients(supabase);

  return (
    <>
      <PageHeader title={en.nav.clients} description={en.library.clients.description} />
      <LibraryTable
        labels={en.library.clients.labels}
        currentUserId={user.id}
        isAdmin={isAdminRole(profile.workspace_role)}
        onSave={saveClient}
        onDelete={deleteClient}
        fields={[
          { key: "name", label: en.library.fields.name, type: "text", required: true, column: true },
          { key: "email", label: en.library.fields.email, type: "email", column: true },
          { key: "phone", label: en.library.fields.phone, type: "tel", column: true },
          { key: "note", label: en.library.fields.note, type: "textarea" },
        ]}
        items={clients.map((client) => ({
          id: client.id,
          createdBy: client.created_by,
          values: {
            name: client.name,
            email: client.email ?? "",
            phone: client.phone ?? "",
            note: client.note ?? "",
          },
        }))}
      />
    </>
  );
}
