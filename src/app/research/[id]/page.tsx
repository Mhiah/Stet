import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { HomeButton } from "@/components/home-button";
import { SiteHeader } from "@/components/site-header";
import { Workstation } from "@/components/workstation";
import { loadProject } from "@/lib/store";

/** A saved run, reopened from disk. Invalid or unknown IDs are a 404. */
const load = (id: string) => loadProject(id).catch(() => null);

export async function generateMetadata(props: PageProps<"/research/[id]">): Promise<Metadata> {
  const project = await load((await props.params).id);
  return { title: project ? `${project.question} · Crux` : "Not found · Crux" };
}

export default async function ResearchPage(props: PageProps<"/research/[id]">) {
  const project = await load((await props.params).id);
  if (!project) notFound();

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-4xl px-5 pt-8 pb-28 sm:pt-12">
        <h1 className="text-2xl font-semibold leading-snug tracking-tight print:hidden">{project.question}</h1>
        <p className="mt-1 text-sm text-muted print:hidden">
          {new Date(project.created_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC
          {project.mode === "mock" && " · mock run (illustrative fixtures)"}
        </p>
        {project.status === "failed" && (
          <p className="mt-4 rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">This run failed: {project.error}</p>
        )}
        <div className="mt-8">
          <Workstation project={project} />
        </div>
      </main>
      <HomeButton />
    </>
  );
}
