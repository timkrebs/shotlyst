import type { NextRequest } from "next/server";

import { loadBranding, loadCreativeExport, loadPdfImages } from "@/features/exports/queries";
import { formatDateTime } from "@/lib/format";
import { attachmentHeaders, exportFilename } from "@/lib/pdf/files";
import { renderStoryboardPdf, STORYBOARD_SIZES, type StoryboardSize } from "@/lib/pdf/storyboard";
import { orderShots, shotNumbers } from "@/lib/shots/totals";
import { createClient } from "@/lib/supabase/server";
import { en } from "@/messages/en";

export const dynamic = "force-dynamic";

function storyboardSize(value: string | null): StoryboardSize {
  return STORYBOARD_SIZES.find((size) => String(size) === value) ?? 6;
}

// The storyboard of one creative as a PDF with 6, 9 or 12 frames per page.
export async function GET(
  request: NextRequest,
  context: RouteContext<"/api/export/storyboard/[creativeId]">,
) {
  const { creativeId } = await context.params;
  const supabase = await createClient();
  const source = await loadCreativeExport(supabase, creativeId);
  if (!source) return new Response(en.errors.notFoundTitle, { status: 404 });

  const { segments, shots } = source.list;
  const [branding, images] = await Promise.all([
    loadBranding(supabase),
    loadPdfImages(
      supabase,
      shots.map((shot) => shot.frame_path),
    ),
  ]);
  const pdf = await renderStoryboardPdf({
    frame: {
      ...branding,
      label: en.exports.storyboard,
      exportedAt: formatDateTime(new Date().toISOString()),
    },
    project: source.project,
    creativeTitle: source.creative.title,
    aspectRatio: source.aspectRatio,
    perPage: storyboardSize(request.nextUrl.searchParams.get("perPage")),
    shots: orderShots(segments, shots),
    numbers: shotNumbers(segments, shots),
    images,
  });
  const filename = exportFilename(
    [source.project.project_number, source.creative.title, en.exports.fileSuffix.storyboard],
    "pdf",
  );
  return new Response(pdf, { headers: attachmentHeaders(filename, "application/pdf") });
}
