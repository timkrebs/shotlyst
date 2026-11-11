import { notFound } from "next/navigation";

import { BoardBar } from "@/features/moodboard/components/board-bar";
import { MoodboardCanvas } from "@/features/moodboard/components/moodboard-canvas";
import { getBoardContent, listBoards, listLibraryImages } from "@/features/moodboard/queries";
import { listCreatives } from "@/features/shots/queries";
import { requireProjectPage } from "@/lib/permissions/guards";
import { projectPermissions } from "@/lib/permissions/roles";

export default async function MoodboardPage({
  params,
  searchParams,
}: PageProps<"/projects/[id]/moodboard">) {
  const { id } = await params;
  const { board: boardParam } = await searchParams;
  const { supabase, role } = await requireProjectPage(id);

  const boards = await listBoards(supabase, id);
  const board = boards.find((candidate) => candidate.id === boardParam) ?? boards[0];
  if (!board) notFound();

  const [content, libraryImages, creatives] = await Promise.all([
    getBoardContent(supabase, board.id),
    listLibraryImages(supabase, id),
    listCreatives(supabase, id),
  ]);

  return (
    <>
      <BoardBar
        projectId={id}
        boards={boards}
        current={board}
        creatives={creatives.map((creative) => ({ id: creative.id, title: creative.title }))}
      />
      <MoodboardCanvas
        key={board.id}
        projectId={id}
        boardId={board.id}
        initialNodes={content.nodes}
        initialEdges={content.edges}
        libraryImages={libraryImages}
        canEdit={projectPermissions(role).canEdit}
      />
    </>
  );
}
