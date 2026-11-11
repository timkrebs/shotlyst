import { ConceptList } from "@/features/concepts/components/concept-list";
import { listConceptFolders, listConcepts } from "@/features/concepts/queries";
import { requireProjectPage } from "@/lib/permissions/guards";

export default async function ConceptsPage({ params }: PageProps<"/projects/[id]/concepts">) {
  const { id } = await params;
  const { supabase } = await requireProjectPage(id);
  const [concepts, folders] = await Promise.all([
    listConcepts(supabase, id),
    listConceptFolders(supabase, id),
  ]);

  return <ConceptList projectId={id} concepts={concepts} folders={folders} />;
}
