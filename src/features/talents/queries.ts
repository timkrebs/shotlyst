import "server-only";

import { loadShotList } from "@/features/shots/queries";
import { shotNumbers } from "@/lib/shots/totals";
import type { ServerClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function listTalents(supabase: ServerClient) {
  const { data, error } = await supabase.from("talents").select("*").order("name");
  if (error) throw new Error(error.message);
  return data;
}

export async function getTalent(supabase: ServerClient, talentId: string) {
  if (!UUID.test(talentId)) return null;
  const { data, error } = await supabase.from("talents").select("*").eq("id", talentId).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export interface TalentUsage {
  project: { id: string; name: string; project_number: string };
  shots: { id: string; number: string; action: string | null; creativeTitle: string }[];
}

// The projects and shots that use a talent. Row Level Security on the cast
// links, shots and projects limits the answer to what the caller may read.
export async function listTalentUsage(supabase: ServerClient, talentId: string): Promise<TalentUsage[]> {
  const { data, error } = await supabase
    .from("shot_talents")
    .select(
      `shot:shots(id, action, creative:creatives(id, title),
                  project:projects(id, name, project_number))`,
    )
    .eq("talent_id", talentId);
  if (error) throw new Error(error.message);
  const shots = data.flatMap((link) => (link.shot?.project && link.shot.creative ? [link.shot] : []));

  // A shot's number is its place in the running order of its creative, so
  // it is computed from the whole list, as on the shot-list page.
  const creativeIds = [...new Set(shots.map((shot) => shot.creative.id))];
  const numbers = new Map<string, string>();
  await Promise.all(
    creativeIds.map(async (creativeId) => {
      const list = await loadShotList(supabase, creativeId);
      for (const [id, number] of shotNumbers(list.segments, list.shots)) numbers.set(id, number);
    }),
  );

  const byProject = new Map<string, TalentUsage>();
  for (const shot of shots) {
    const usage = byProject.get(shot.project.id) ?? { project: shot.project, shots: [] };
    usage.shots.push({
      id: shot.id,
      number: numbers.get(shot.id) ?? "",
      action: shot.action,
      creativeTitle: shot.creative.title,
    });
    byProject.set(shot.project.id, usage);
  }
  const collator = new Intl.Collator("en", { numeric: true });
  return [...byProject.values()]
    .map((usage) => ({
      ...usage,
      shots: usage.shots.sort(
        (a, b) =>
          collator.compare(a.creativeTitle, b.creativeTitle) || collator.compare(a.number, b.number),
      ),
    }))
    .sort((a, b) => collator.compare(a.project.name, b.project.name));
}

export type Talent = Awaited<ReturnType<typeof listTalents>>[number];
