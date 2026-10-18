"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { RunSummary } from "@/lib/arkiv/runs";
import type { ResearchProject, RunChallenge } from "@/lib/types";

const short = (h: string | null | undefined, n = 6) => (h ? `${h.slice(0, n + 2)}…${h.slice(-4)}` : "unknown");

/**
 * Where a run lives on Arkiv and what anyone can do with it: check it, download the exact
 * record, see its revisions, and read every challenge filed against it from any wallet.
 */
export function ArkivPanel({ project }: { project: ResearchProject }) {
  const a = project.arkiv;
  const [revisions, setRevisions] = useState<RunSummary[] | null>(null);
  const [challenges, setChallenges] = useState<RunChallenge[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!a) return;
    const get = (url: string) =>
      fetch(url).then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.error ?? `Request failed (${r.status}).`);
        return body;
      });
    get(`/api/runs?lineage=${a.lineage}`)
      .then((b) => setRevisions(b.runs))
      .catch((e) => setLoadError(String(e.message ?? e)));
    get(`/api/research/${project.id}/challenges`)
      .then((b) => setChallenges(b.challenges))
      .catch((e) => setLoadError(String(e.message ?? e)));
  }, [a, project.id]);

  if (!a) return null;

  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-surface print:hidden" aria-label="On Arkiv">
      <div className="flex flex-wrap items-center gap-2 bg-brand px-5 py-4 text-brand-ink">
        <h2 className="mr-1 flex items-center gap-2 text-base font-semibold">
          <span className="h-2 w-2 rounded-full bg-mint" aria-hidden />
          On Arkiv
        </h2>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${a.intact ? "bg-mint text-brand" : "bg-bad-soft text-bad"}`}>
          {a.intact ? "Hash intact" : "Hash mismatch"}
        </span>
        {a.readonly && <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs font-medium">Read-only</span>}
        <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-brand-muted">Anyone can extend its life</span>
      </div>

      <div className="p-5">
      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[max-content_1fr]">
        <dt className="text-muted">Entity</dt>
        <dd className="min-w-0 break-all font-mono text-xs">
          <a href={a.explorer_url} target="_blank" rel="noreferrer" className="text-info underline underline-offset-2">
            {a.key}
          </a>
        </dd>
        <dt className="text-muted">Content SHA-256</dt>
        <dd className="min-w-0 break-all font-mono text-xs">{a.content_sha256}</dd>
        <dt className="text-muted">Written by</dt>
        <dd className="min-w-0 break-all font-mono text-xs">{a.owner ?? "unknown"}</dd>
        {a.expires_at_block && (
          <>
            <dt className="text-muted">Expires at block</dt>
            <dd className="font-mono text-xs">{a.expires_at_block}</dd>
          </>
        )}
        {a.supersedes && (
          <>
            <dt className="text-muted">Revises</dt>
            <dd>
              <Link href={`/research/${a.supersedes}`} className="text-info underline underline-offset-2">
                earlier run
              </Link>{" "}
              <span className="text-muted">(left unchanged on Arkiv)</span>
            </dd>
          </>
        )}
      </dl>

      <div className="mt-4 flex flex-wrap gap-2 text-sm">
        <a href={`/api/research/${project.id}/record`} className="rounded-lg border border-line bg-background px-3 py-1.5 hover:border-sage">
          Download record
        </a>
        <Link href={`/verify?run=${project.id}`} className="rounded-lg border border-line bg-background px-3 py-1.5 hover:border-sage">
          Verify a copy
        </Link>
        <Link href={`/?revise=${project.id}`} className="rounded-lg border border-line bg-background px-3 py-1.5 hover:border-sage">
          Re-run as a revision
        </Link>
      </div>

      {loadError && <p className="mt-4 text-sm text-bad">Couldn&apos;t load from Arkiv: {loadError}</p>}

      {revisions && revisions.length > 1 && (
        <div className="mt-6">
          <h3 className="text-sm font-semibold">Revisions ({revisions.length})</h3>
          <ol className="mt-2 space-y-1 text-sm">
            {revisions.map((r) => (
              <li key={r.key} className="flex flex-wrap gap-x-2">
                {r.run_id === project.id ? (
                  <span className="font-medium">This run</span>
                ) : (
                  <Link href={`/research/${r.run_id}`} className="text-info underline underline-offset-2">
                    {r.supersedes ? "Revision" : "Original"}
                  </Link>
                )}
                <span className="text-muted">
                  {new Date(r.created_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC · {r.confidence}{" "}
                  confidence · {r.verdict}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="mt-6">
        <h3 className="text-sm font-semibold">Challenges {challenges ? `(${challenges.length})` : ""}</h3>
        <p className="mt-1 text-sm text-muted">
          Anyone can file a counter-claim against this brief from their own wallet. It lives on Arkiv under their address, not
          Stet&apos;s, so Stet can&apos;t remove it.
        </p>
        {challenges && challenges.length === 0 && <p className="mt-2 text-sm text-muted">None filed yet.</p>}
        {challenges && challenges.length > 0 && (
          <ul className="mt-3 space-y-3">
            {challenges.map((c) => (
              <li key={c.key} className="rounded-xl border border-line bg-background p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                  <span className="rounded bg-surface px-1.5 py-0.5 font-mono">{c.target}</span>
                  <span className="font-mono">{short(c.owner)}</span>
                  {c.independent && <span className="rounded-full bg-warn-soft px-2 py-0.5 font-medium text-warn">Independent wallet</span>}
                </div>
                <p className="mt-2 whitespace-pre-wrap">{c.text}</p>
                {c.evidence_url && /^https?:\/\//.test(c.evidence_url) && (
                  <a href={c.evidence_url} target="_blank" rel="noreferrer nofollow" className="mt-1 inline-block break-all text-info underline underline-offset-2">
                    {c.evidence_url}
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-muted">How to file one</summary>
          <pre className="mt-2 overflow-x-auto rounded-lg bg-background p-3 font-mono text-xs">
            {`CHALLENGER_PRIVATE_KEY=0x… npm run challenge -- \\
  --run ${project.id} --target C1 \\
  --text "What this brief gets wrong, and why" \\
  --url https://link-to-your-evidence`}
          </pre>
        </details>
      </div>
      </div>
    </section>
  );
}
