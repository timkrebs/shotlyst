import { notFound } from "next/navigation";

import { CreativeBar } from "@/features/shots/components/creative-bar";
import { ShotListWorkspace } from "@/features/shots/components/shot-list-workspace";
import {
  listColumnSettings,
  listCreatives,
  listTalentNames,
  loadShotList,
} from "@/features/shots/queries";
import { getProject } from "@/features/projects/queries";
import { requireProjectPage } from "@/lib/permissions/guards";
import { projectPermissions } from "@/lib/permissions/roles";
import { parseAspectRatio } from "@/lib/shots/aspect";
import { allColumns, customColumns } from "@/lib/shots/columns";

export default async function ShotListPage({
  params,
  searchParams,
}: PageProps<"/projects/[id]/shotlist">) {
  const { id } = await params;
  const { creative: creativeParam } = await searchParams;
  const { supabase, role } = await requireProjectPage(id);

  const [project, creatives, settings, talents] = await Promise.all([
    getProject(supabase, id),
    listCreatives(supabase, id),
    listColumnSettings(supabase, id),
    listTalentNames(supabase),
  ]);
  const creative = creatives.find((candidate) => candidate.id === creativeParam) ?? creatives[0];
  if (!project || !creative) notFound();

  // Runtime and targets of the other creatives, for the project total.
  const [shotList, otherShots, otherSegments] = await Promise.all([
    loadShotList(supabase, creative.id),
    supabase.from("shots").select("duration_sec").eq("project_id", id).neq("creative_id", creative.id),
    supabase
      .from("segments")
      .select("target_duration_sec")
      .eq("project_id", id)
      .neq("creative_id", creative.id)
      .not("target_duration_sec", "is", null),
  ]);
  const otherTargets = otherSegments.data ?? [];

  return (
    <div className="grid gap-4">
      <CreativeBar
        projectId={id}
        creatives={creatives}
        current={creative}
        projectAspectRatio={project.aspect_ratio}
        canEdit={projectPermissions(role).canEdit}
      />
      <ShotListWorkspace
        key={creative.id}
        projectId={id}
        creative={{ id: creative.id, title: creative.title }}
        aspectRatio={parseAspectRatio(creative.aspect_ratio ?? project.aspect_ratio)}
        initial={shotList}
        columns={allColumns(settings)}
        customColumns={customColumns(settings)}
        initialTalents={talents}
        otherCreatives={{
          totalSec: (otherShots.data ?? []).reduce((sum, shot) => sum + shot.duration_sec, 0),
          targetSec:
            otherTargets.length > 0
              ? otherTargets.reduce((sum, row) => sum + (row.target_duration_sec ?? 0), 0)
              : null,
        }}
      />
    </div>
  );
}
