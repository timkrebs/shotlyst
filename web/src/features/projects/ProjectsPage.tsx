/**
 * features/projects/ProjectsPage.tsx — /projects. Placeholder until the
 * planning service lands (M2); it gives the shell a signed-in landing page.
 */
import { EmptyState } from "../../components/EmptyState";
import { t } from "../../i18n";

export function ProjectsPage() {
  return (
    <section>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">{t("projects.title")}</h1>
      <EmptyState>{t("projects.empty")}</EmptyState>
    </section>
  );
}
