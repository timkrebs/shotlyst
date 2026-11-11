import "server-only";

import { listBeats } from "@/features/concepts/queries";
import { listColumnSettings, listTalentNames, loadShotList } from "@/features/shots/queries";
import { MEDIA_BUCKET } from "@/lib/files";
import { readPdfImage, type PdfImage } from "@/lib/pdf/files";
import { signedUrls } from "@/lib/storage";
import type { ServerClient } from "@/lib/supabase/server";

// Data for the PDF and CSV exports. Everything is read with the caller's own
// client, so Row Level Security decides what an export may contain.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LOGO_PATH = /^library\/branding\/[0-9a-f-]{36}\.(png|jpg|jpeg)$/;
const IMAGE_BATCH = 6;
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;

export function isUuid(value: string): boolean {
  return UUID.test(value);
}

export function isLogoPath(value: unknown): value is string {
  return typeof value === "string" && LOGO_PATH.test(value);
}

async function fetchImage(url: string): Promise<PdfImage | null> {
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    return bytes.length > MAX_IMAGE_BYTES ? null : readPdfImage(bytes);
  } catch {
    return null;
  }
}

// Loads images from private storage into memory for the PDF renderer. Paths
// the caller may not read, and files that are not PNG or JPEG, are left out.
export async function loadPdfImages(
  supabase: ServerClient,
  paths: (string | null | undefined)[],
): Promise<Map<string, PdfImage>> {
  const urls = [...(await signedUrls(supabase, paths))];
  const images = new Map<string, PdfImage>();
  for (let index = 0; index < urls.length; index += IMAGE_BATCH) {
    const batch = urls.slice(index, index + IMAGE_BATCH);
    const loaded = await Promise.all(batch.map(([, url]) => fetchImage(url)));
    batch.forEach(([path], position) => {
      const image = loaded[position];
      if (image) images.set(path, image);
    });
  }
  return images;
}

export interface ExportSettings {
  company: string | null;
  logoPath: string | null;
}

// The company line and logo path as stored in the workspace settings.
export async function getExportSettings(supabase: ServerClient): Promise<ExportSettings> {
  const { data } = await supabase
    .from("app_settings")
    .select("key, value")
    .in("key", ["export_company", "export_logo_path"]);
  const values = new Map((data ?? []).map((row) => [row.key, row.value]));
  const company = values.get("export_company");
  const logoPath = values.get("export_logo_path");
  return {
    company: typeof company === "string" && company.trim() ? company.trim() : null,
    logoPath: isLogoPath(logoPath) ? logoPath : null,
  };
}

export interface Branding {
  company: string | null;
  logo: PdfImage | null;
}

// What the header of every PDF shows.
export async function loadBranding(supabase: ServerClient): Promise<Branding> {
  const { company, logoPath } = await getExportSettings(supabase);
  const images = await loadPdfImages(supabase, [logoPath]);
  return { company, logo: logoPath ? (images.get(logoPath) ?? null) : null };
}

// One creative with everything the shot list shows; null when the caller
// cannot read it.
export async function loadCreativeExport(supabase: ServerClient, creativeId: string) {
  if (!isUuid(creativeId)) return null;
  const { data: creative, error } = await supabase
    .from("creatives")
    .select("id, title, aspect_ratio, project:projects(id, name, project_number, aspect_ratio)")
    .eq("id", creativeId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!creative?.project) return null;

  const [list, settings, talents] = await Promise.all([
    loadShotList(supabase, creative.id),
    listColumnSettings(supabase, creative.project.id),
    listTalentNames(supabase),
  ]);
  return {
    creative: { id: creative.id, title: creative.title },
    project: creative.project,
    aspectRatio: creative.aspect_ratio ?? creative.project.aspect_ratio,
    list,
    settings,
    talentNames: new Map(talents.map((talent) => [talent.id, talent.name])),
  };
}

// One concept with its beats; null when the caller cannot read it.
export async function loadConceptExport(supabase: ServerClient, conceptId: string) {
  if (!isUuid(conceptId)) return null;
  const { data: concept, error } = await supabase
    .from("concepts")
    .select("id, title, content, project:projects(id, name, project_number)")
    .eq("id", conceptId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!concept?.project) return null;
  return { concept, project: concept.project, beats: await listBeats(supabase, concept.id) };
}

// Reads an uploaded object back, to check it before it is used as the logo.
export async function downloadObject(supabase: ServerClient, path: string): Promise<Uint8Array | null> {
  const { data, error } = await supabase.storage.from(MEDIA_BUCKET).download(path);
  if (error || !data) return null;
  return new Uint8Array(await data.arrayBuffer());
}

export type CreativeExport = NonNullable<Awaited<ReturnType<typeof loadCreativeExport>>>;
export type ConceptExport = NonNullable<Awaited<ReturnType<typeof loadConceptExport>>>;
