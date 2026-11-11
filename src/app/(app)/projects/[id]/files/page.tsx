import { notFound } from "next/navigation";

import { FileLibrary } from "@/features/files/components/file-library";
import { listFiles } from "@/features/files/queries";
import { getProject } from "@/features/projects/queries";
import { requireProjectPage } from "@/lib/permissions/guards";

export default async function ProjectFilesPage({ params }: PageProps<"/projects/[id]/files">) {
  const { id } = await params;
  const { supabase } = await requireProjectPage(id);
  const [project, files] = await Promise.all([getProject(supabase, id), listFiles(supabase, id)]);
  if (!project) notFound();

  return <FileLibrary projectId={id} coverFileId={project.cover_file_id} files={files} />;
}
