import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { SiteHeader } from "@/components/site-header";
import { listRuns, type RunSummary } from "@/lib/arkiv/runs";
import { arkiv } from "@/lib/store";

export const metadata: Metadata = { title: "Runs on Arkiv · Stet" };

/** Every brief Stet has published, read straight from Arkiv. */
export default async function RunsPage() {
  await connection();
  let runs: RunSummary[] = [];
  let error: string | null = null;
  try {
    runs = await listRuns(arkiv(), { limit: 50 });
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }
  const writer = arkiv().writer;

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl px-5 pt-8 pb-28 sm:pt-12">
        <h1 className="text-2xl font-semibold tracking-tight">Runs on Arkiv</h1>
        <p className="mt-2 text-sm text-muted">
          Read from Arkiv&apos;s Tiramisu testnet, not from Stet&apos;s server. Every run is a read-only entity
          {writer ? (
            <>
              {" "}
              written by <span className="break-all font-mono text-xs">{writer}</span>
            </>
          ) : null}
          , so this list can be rebuilt by anyone with the query{" "}
          <code className="font-mono text-xs">app = &quot;stet&quot; &amp;&amp; kind = &quot;run&quot;</code>.
        </p>
        {error && <p className="mt-6 rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">Couldn&apos;t reach Arkiv: {error}</p>}
        {!error && runs.length === 0 && <p className="mt-6 text-sm text-muted">No runs published yet.</p>}
        <ul className="mt-6 divide-y divide-line">
          {runs.map((r) => (
            <li key={r.key} className="py-4">
              <Link href={`/research/${r.run_id}`} className="font-medium hover:underline">
                {r.question}
              </Link>
              <p className="mt-1 text-sm text-muted">
                {new Date(r.created_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC ·{" "}
                {r.confidence} confidence · thesis {r.verdict}
                {r.supersedes ? " · revision" : ""}
              </p>
            </li>
          ))}
        </ul>
      </main>
    </>
  );
}
