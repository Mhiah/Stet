import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { AppShell, Eyebrow } from "@/components/app-shell";
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

  const pill = (v: string, kind: "confidence" | "verdict") => {
    const tone =
      kind === "confidence"
        ? v === "high"
          ? "bg-good-soft text-good"
          : v === "medium"
            ? "bg-warn-soft text-warn"
            : "bg-bad-soft text-bad"
        : v === "strengthened" || v === "survived"
          ? "bg-good-soft text-good"
          : v === "weakened"
            ? "bg-warn-soft text-warn"
            : "bg-bad-soft text-bad";
    return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>{v}</span>;
  };

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-5xl px-5 pt-8 pb-28 sm:px-10 sm:pt-10">
        <Eyebrow>Read from Arkiv</Eyebrow>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Recorded briefs</h1>
          <Link href="/" className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-ink hover:opacity-90">
            New run →
          </Link>
        </div>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Listed straight from Arkiv&apos;s Tiramisu testnet, not from Stet&apos;s server. Anyone can rebuild this list with the
          query <code className="rounded bg-surface px-1 font-mono text-xs">app = &quot;stet&quot; &amp;&amp; kind = &quot;run&quot;</code>
          {writer ? (
            <>
              {" "}
              filtered to the writer wallet <span className="break-all font-mono text-xs">{writer}</span>
            </>
          ) : null}
          .
        </p>

        {error && <p className="mt-6 rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">Couldn&apos;t reach Arkiv: {error}</p>}
        {!error && runs.length === 0 && (
          <div className="mt-8 rounded-2xl border border-dashed border-line bg-surface p-8 text-center text-sm text-muted">No briefs recorded yet.</div>
        )}

        {runs.length > 0 && (
          <div className="mt-8 overflow-hidden rounded-2xl border border-line bg-surface">
            <div className="hidden grid-cols-[1fr_7rem_8rem_9rem] gap-4 border-b border-line px-5 py-3 text-xs font-medium text-muted md:grid">
              <span>Question</span>
              <span>Confidence</span>
              <span>Stress test</span>
              <span>Recorded (UTC)</span>
            </div>
            <ul className="divide-y divide-line">
              {runs.map((r) => (
                <li key={r.key}>
                  <Link
                    href={`/research/${r.run_id}`}
                    className="grid gap-2 px-5 py-4 transition hover:bg-mint-soft md:grid-cols-[1fr_7rem_8rem_9rem] md:items-center md:gap-4"
                  >
                    <span className="min-w-0">
                      <span className="block font-medium leading-snug">{r.question}</span>
                      <span className="mt-0.5 block font-mono text-xs text-muted">
                        {r.key.slice(0, 10)}…{r.key.slice(-4)}
                        {r.supersedes ? " · revision" : ""}
                      </span>
                    </span>
                    <span>{pill(r.confidence, "confidence")}</span>
                    <span>{pill(r.verdict, "verdict")}</span>
                    <span className="text-sm text-muted">
                      {new Date(r.created_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </main>
    </AppShell>
  );
}
