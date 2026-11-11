import type { NextRequest } from "next/server";

import { loadBranding, loadConceptExport, loadPdfImages } from "@/features/exports/queries";
import { formatDateTime } from "@/lib/format";
import { renderConceptPdf } from "@/lib/pdf/concept";
import { attachmentHeaders, exportFilename } from "@/lib/pdf/files";
import { imagePaths, tiptapToBlocks } from "@/lib/pdf/tiptap";
import { createClient } from "@/lib/supabase/server";
import { en } from "@/messages/en";

export const dynamic = "force-dynamic";

// One concept as a PDF: the written document with its images, then the beats.
export async function GET(
  _request: NextRequest,
  context: RouteContext<"/api/export/concept/[conceptId]">,
) {
  const { conceptId } = await context.params;
  const supabase = await createClient();
  const source = await loadConceptExport(supabase, conceptId);
  if (!source) return new Response(en.errors.notFoundTitle, { status: 404 });

  const blocks = tiptapToBlocks(source.concept.content);
  // Storage signs only paths the caller may read, so an image from a project
  // they are not in is left out.
  const [branding, images] = await Promise.all([
    loadBranding(supabase),
    loadPdfImages(supabase, imagePaths(blocks)),
  ]);
  const pdf = await renderConceptPdf({
    frame: {
      ...branding,
      label: en.exports.concept,
      exportedAt: formatDateTime(new Date().toISOString()),
    },
    project: source.project,
    title: source.concept.title,
    blocks,
    beats: source.beats,
    images,
  });
  const filename = exportFilename(
    [source.project.project_number, source.concept.title, en.exports.fileSuffix.concept],
    "pdf",
  );
  return new Response(pdf, { headers: attachmentHeaders(filename, "application/pdf") });
}
