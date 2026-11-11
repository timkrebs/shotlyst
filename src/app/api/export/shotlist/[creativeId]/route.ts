import type { NextRequest } from "next/server";

import { loadBranding, loadCreativeExport, loadPdfImages } from "@/features/exports/queries";
import { toCsv } from "@/lib/csv";
import { formatDateTime } from "@/lib/format";
import { attachmentHeaders, exportFilename } from "@/lib/pdf/files";
import { renderShotListPdf } from "@/lib/pdf/shot-list";
import { shotListCsvRows, shotListExport } from "@/lib/pdf/shot-list-rows";
import { visibleColumns } from "@/lib/shots/columns";
import { createClient } from "@/lib/supabase/server";
import { en } from "@/messages/en";

export const dynamic = "force-dynamic";

// The shot list of one creative as PDF (default) or CSV, with the columns
// the project shows on screen. Row Level Security decides what the caller
// may export; an unreadable creative does not exist for them.
export async function GET(
  request: NextRequest,
  context: RouteContext<"/api/export/shotlist/[creativeId]">,
) {
  const { creativeId } = await context.params;
  const supabase = await createClient();
  const source = await loadCreativeExport(supabase, creativeId);
  if (!source) return new Response(en.errors.notFoundTitle, { status: 404 });

  const columns = visibleColumns(source.settings);
  const data = shotListExport(source.list, columns, source.talentNames);
  const nameParts = [source.project.project_number, source.creative.title, en.exports.fileSuffix.shotList];

  if (request.nextUrl.searchParams.get("format") === "csv") {
    return new Response(toCsv(shotListCsvRows(data, columns)), {
      headers: attachmentHeaders(exportFilename(nameParts, "csv"), "text/csv; charset=utf-8"),
    });
  }

  const showFrames = columns.some((column) => column.kind === "frame");
  const [branding, images] = await Promise.all([
    loadBranding(supabase),
    loadPdfImages(supabase, showFrames ? source.list.shots.map((shot) => shot.frame_path) : []),
  ]);
  const pdf = await renderShotListPdf({
    frame: {
      ...branding,
      label: en.exports.shotList,
      exportedAt: formatDateTime(new Date().toISOString()),
    },
    project: source.project,
    creativeTitle: source.creative.title,
    aspectRatio: source.aspectRatio,
    columns,
    data,
    images,
  });
  return new Response(pdf, {
    headers: attachmentHeaders(exportFilename(nameParts, "pdf"), "application/pdf"),
  });
}
