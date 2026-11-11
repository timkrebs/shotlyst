import { redirect } from "next/navigation";

export default async function ProjectIndexPage({ params }: PageProps<"/projects/[id]">) {
  const { id } = await params;
  redirect(`/projects/${id}/overview`);
}
