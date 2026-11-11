import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { getTalent, listTalentUsage } from "@/features/talents/queries";
import { formatDayRate } from "@/features/talents/schema";
import { formatDate } from "@/lib/format";
import { requireMemberPage } from "@/lib/permissions/guards";
import { en } from "@/messages/en";

export const metadata: Metadata = { title: en.nav.talents };

// One talent with its details and the shots that use it.
export default async function TalentPage(props: PageProps<"/library/talents/[id]">) {
  const { id } = await props.params;
  const { supabase } = await requireMemberPage();
  const talent = await getTalent(supabase, id);
  if (!talent) notFound();
  const usage = await listTalentUsage(supabase, talent.id);

  const fields = en.talents.fields;
  const details: [string, string][] = [
    [fields.type, en.talents.type[talent.type as keyof typeof en.talents.type] ?? talent.type],
    [fields.description, talent.description ?? ""],
    [fields.birthDate, talent.birth_date ? formatDate(talent.birth_date) : ""],
    [fields.languages, talent.languages.join(", ")],
    [fields.residence, talent.residence ?? ""],
    [fields.contact, talent.contact ?? ""],
    [fields.dayRate, formatDayRate(talent.daily_rate_cents)],
    [fields.tags, talent.tags.join(", ")],
  ];

  return (
    <>
      <Link
        href="/library/talents"
        className="text-muted-foreground hover:text-foreground mb-2 inline-block text-sm"
      >
        ← {en.talents.back}
      </Link>
      <PageHeader title={talent.name} />
      <dl className="grid max-w-2xl grid-cols-[10rem_1fr] gap-x-4 gap-y-2 text-sm">
        {details.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="whitespace-pre-wrap">{value || "–"}</dd>
          </div>
        ))}
      </dl>

      <section className="mt-8 max-w-2xl" aria-labelledby="talent-usage">
        <h2 id="talent-usage" className="mb-3 text-base font-semibold">
          {en.talents.usedIn}
        </h2>
        {usage.length === 0 ? (
          <p className="text-muted-foreground text-sm">{en.talents.notUsed}</p>
        ) : (
          <ul className="grid gap-4">
            {usage.map(({ project, shots }) => (
              <li key={project.id} className="rounded-md border p-3">
                <Link
                  href={`/projects/${project.id}/shotlist`}
                  aria-label={en.talents.openShotList(project.name)}
                  className="font-medium hover:underline"
                >
                  {project.name}
                </Link>
                <span className="text-muted-foreground ml-2 text-xs">{project.project_number}</span>
                <ul className="mt-2 grid gap-1 text-sm">
                  {shots.map((shot) => (
                    <li key={shot.id}>
                      <Link href={`/projects/${project.id}/shotlist`} className="hover:underline">
                        <span className="font-medium">{en.talents.shot(shot.number)}</span>
                        <span className="text-muted-foreground"> · {shot.creativeTitle}</span>
                        {shot.action ? <span> · {shot.action}</span> : null}
                      </Link>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
