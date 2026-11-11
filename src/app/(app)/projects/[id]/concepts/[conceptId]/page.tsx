import type { JSONContent } from "@tiptap/react";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { BeatRail } from "@/features/concepts/components/beat-rail";
import { ConceptEditor } from "@/features/concepts/components/concept-editor";
import { ConceptHeader } from "@/features/concepts/components/concept-header";
import { getConcept, listBeats, listConceptFolders } from "@/features/concepts/queries";
import { requireProjectPage } from "@/lib/permissions/guards";
import { projectPermissions } from "@/lib/permissions/roles";
import { en } from "@/messages/en";

export default async function ConceptPage({
  params,
}: PageProps<"/projects/[id]/concepts/[conceptId]">) {
  const { id, conceptId } = await params;
  if (!z.uuid().safeParse(conceptId).success) notFound();

  const { supabase, role } = await requireProjectPage(id);
  const { canEdit } = projectPermissions(role);
  const [concept, beats, folders] = await Promise.all([
    getConcept(supabase, id, conceptId),
    listBeats(supabase, conceptId),
    listConceptFolders(supabase, id),
  ]);
  if (!concept) notFound();

  return (
    <div className="grid gap-4">
      <Link
        href={`/projects/${id}/concepts`}
        className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm"
      >
        <ChevronLeft className="size-4" aria-hidden />
        {en.concepts.all}
      </Link>
      <ConceptHeader projectId={id} concept={concept} folders={folders} canEdit={canEdit} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <ConceptEditor
          key={concept.id}
          projectId={id}
          conceptId={concept.id}
          initialContent={concept.content as JSONContent}
          editable={canEdit}
        />
        <BeatRail projectId={id} conceptId={concept.id} beats={beats} canEdit={canEdit} />
      </div>
    </div>
  );
}
