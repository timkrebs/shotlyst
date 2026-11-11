import { redirect } from "next/navigation";

// The Home dashboard arrives with tasks in phase 2; until then the project
// list is the start page.
export default function HomePage() {
  redirect("/projects");
}
