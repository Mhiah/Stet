"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Hex } from "viem";
import {
  FAUCET_URL,
  balanceOf,
  blockClock,
  connectWallet,
  fileChallenge,
  hasWallet,
  keepAliveFromBrowser,
  watchArkiv,
} from "@/lib/arkiv/browser";
import type { RunSummary } from "@/lib/arkiv/runs";
import type { ResearchProject, RunChallenge } from "@/lib/types";

const short = (h: string | null | undefined, n = 6) => (h ? `${h.slice(0, n + 2)}…${h.slice(-4)}` : "unknown");
const EXPLORER = "https://tiramisu.explorer.arkiv.network";

type Check = "checking" | "intact" | "mismatch" | "unavailable";

/**
 * Where a brief lives on Arkiv, and everything anyone can do with it from their own browser:
 * re-check its hash, download the exact record, see revisions, file a challenge from their own
 * wallet, keep it alive, and watch new challenges and extensions arrive live.
 */
export function ArkivPanel({ project }: { project: ResearchProject }) {
  const a = project.arkiv;
  const [revisions, setRevisions] = useState<RunSummary[] | null>(null);
  const [challenges, setChallenges] = useState<RunChallenge[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [check, setCheck] = useState<Check>("checking");
  const [computed, setComputed] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<bigint | null>(a?.expires_at_block ? BigInt(a.expires_at_block) : null);
  const [clock, setClock] = useState<{ block: bigint; secondsPerBlock: number; at: number } | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const loadChallenges = useCallback(
    () =>
      fetch(`/api/research/${project.id}/challenges`)
        .then(async (r) => {
          const body = await r.json();
          if (!r.ok) throw new Error(body.error ?? `Request failed (${r.status}).`);
          setChallenges(body.challenges);
        })
        .catch((e) => setLoadError(String(e.message ?? e))),
    [project.id],
  );

  // Revisions and challenges, from Arkiv via the app's API.
  useEffect(() => {
    if (!a) return;
    fetch(`/api/runs?lineage=${a.lineage}`)
      .then((r) => r.json())
      .then((b) => setRevisions(b.runs ?? null))
      .catch(() => {});
    loadChallenges();
  }, [a, loadChallenges]);

  // Re-check the hash here, in the visitor's browser, against the exact stored record.
  useEffect(() => {
    if (!a) return;
    let cancelled = false;
    (async () => {
      try {
        const bytes = await (await fetch(`/api/research/${project.id}/record`)).arrayBuffer();
        const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
        const hex = `0x${[...digest].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
        await new Promise((r) => setTimeout(r, 900)); // let the check be seen
        if (cancelled) return;
        setComputed(hex);
        setCheck(hex === a.content_sha256.toLowerCase() ? "intact" : "mismatch");
      } catch {
        if (!cancelled) setCheck("unavailable");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [a, project.id]);

  // Live: Arkiv entity events. A new entity may be a challenge on this brief; an extension may be this brief's.
  useEffect(() => {
    if (!a) return;
    blockClock()
      .then((c) => setClock({ ...c, at: Date.now() }))
      .catch(() => {});
    const unwatch = watchArkiv({
      created: () => loadChallenges(),
      extended: (key, newExpiry) => {
        if (key.toLowerCase() === a.key.toLowerCase()) {
          setExpiresAt(newExpiry);
          setFlash("Extended on Arkiv just now");
        }
      },
    });
    return () => unwatch();
  }, [a, loadChallenges]);

  const expiryDate = useMemo(() => {
    if (!expiresAt || !clock) return null;
    const seconds = Number(expiresAt - clock.block) * clock.secondsPerBlock;
    return new Date(clock.at + seconds * 1000);
  }, [expiresAt, clock]);

  if (!a) return null;

  const targets = [
    "conclusion",
    ...(project.thesis?.assumptions ?? []).map((x) => x.id),
    ...(project.research?.claims ?? []).map((x) => x.id),
  ];

  return (
    <section className="stet-rise overflow-hidden rounded-2xl border border-line bg-surface print:hidden" aria-label="On Arkiv">
      <div className="relative flex flex-wrap items-center gap-2 overflow-hidden bg-brand px-5 py-4 text-brand-ink">
        {check === "checking" && <span aria-hidden className="stet-scan pointer-events-none absolute inset-y-0 w-1/3" />}
        <h2 className="mr-1 flex items-center gap-2 text-base font-semibold">
          <span className="stet-pulse h-2 w-2 rounded-full bg-mint" aria-hidden />
          On Arkiv
        </h2>
        <span
          key={check}
          className={`stet-pop rounded-full px-2 py-0.5 text-xs font-medium ${
            check === "intact" ? "bg-mint text-brand" : check === "checking" ? "bg-white/10 text-brand-muted" : "bg-bad-soft text-bad"
          }`}
        >
          {check === "checking"
            ? "Checking hash in your browser…"
            : check === "intact"
              ? "Hash intact · verified in your browser"
              : check === "mismatch"
                ? "Hash mismatch"
                : a.intact
                  ? "Hash intact"
                  : "Hash mismatch"}
        </span>
        {a.readonly && <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs font-medium">Read-only</span>}
        <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-brand-muted">Anyone can extend its life</span>
        <span className="ml-auto flex items-center gap-1.5 text-xs text-brand-muted">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-mint opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-mint" />
          </span>
          Live from Arkiv
        </span>
      </div>

      <div className="p-5">
        <dl className="stet-stagger grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[max-content_1fr]">
          <dt className="text-muted">Entity</dt>
          <dd className="min-w-0 break-all font-mono text-xs">
            <a href={a.explorer_url} target="_blank" rel="noreferrer" className="text-info underline underline-offset-2">
              {a.key}
            </a>
          </dd>
          <dt className="text-muted">Content SHA-256</dt>
          <dd className="min-w-0 break-all font-mono text-xs">{a.content_sha256}</dd>
          {computed && (
            <>
              <dt className="text-muted">Computed here</dt>
              <dd className={`stet-pop min-w-0 break-all font-mono text-xs ${check === "intact" ? "text-good" : "text-bad"}`}>{computed}</dd>
            </>
          )}
          <dt className="text-muted">Written by ($creator)</dt>
          <dd className="min-w-0 break-all font-mono text-xs">{a.owner ?? "unknown"}</dd>
          {expiresAt && (
            <>
              <dt className="text-muted">Lives on Arkiv until</dt>
              <dd className="text-sm">
                <span key={String(expiresAt)} className="stet-pop inline-block">
                  {expiryDate ? expiryDate.toLocaleDateString("en-GB", { dateStyle: "medium" }) : "…"}
                </span>{" "}
                <span className="font-mono text-xs text-muted">(block {expiresAt.toString()})</span>
                {flash && <span className="stet-pop ml-2 rounded-full bg-mint-soft px-2 py-0.5 text-xs text-good">{flash}</span>}
              </dd>
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
          <a href={`/api/research/${project.id}/record`} className="stet-lift rounded-lg border border-line bg-background px-3 py-1.5 hover:border-sage">
            Download record
          </a>
          <Link href={`/verify?run=${project.id}`} className="stet-lift rounded-lg border border-line bg-background px-3 py-1.5 hover:border-sage">
            Verify a copy
          </Link>
          <Link href={`/?revise=${project.id}`} className="stet-lift rounded-lg border border-line bg-background px-3 py-1.5 hover:border-sage">
            Re-run as a revision
          </Link>
          <a href={`/reader.html#${project.id}`} target="_blank" rel="noreferrer" className="stet-lift rounded-lg border border-line bg-background px-3 py-1.5 hover:border-sage">
            Open in the standalone reader
          </a>
        </div>

        {loadError && <p className="mt-4 text-sm text-bad">Couldn&apos;t load from Arkiv: {loadError}</p>}

        {revisions && revisions.length > 1 && (
          <div className="mt-6">
            <h3 className="text-sm font-semibold">Revisions ({revisions.length})</h3>
            <ol className="stet-stagger mt-2 space-y-1 text-sm">
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
                    {new Date(r.created_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC · {r.confidence} confidence ·{" "}
                    {r.verdict}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )}

        <WalletActions
          runId={project.id}
          targets={targets}
          onChallenged={loadChallenges}
          onExtended={() => setFlash("Extension sent, waiting for Arkiv…")}
        />

        <div className="mt-6">
          <h3 className="text-sm font-semibold">Challenges {challenges ? `(${challenges.length})` : ""}</h3>
          <p className="mt-1 text-sm text-muted">
            Filed from any wallet. Each lives on Arkiv under its challenger&apos;s address, not Stet&apos;s, so Stet can&apos;t remove it.
          </p>
          {challenges && challenges.length === 0 && <p className="mt-2 text-sm text-muted">None filed yet.</p>}
          {challenges && challenges.length > 0 && (
            <ul className="stet-stagger mt-3 space-y-3">
              {challenges.map((c) => (
                <li key={c.key} className="stet-lift rounded-xl border border-line bg-background p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                    <span className="rounded bg-surface px-1.5 py-0.5 font-mono">{c.target}</span>
                    <a href={`${EXPLORER}/entity/${c.key}`} target="_blank" rel="noreferrer" className="font-mono underline-offset-2 hover:underline">
                      {short(c.owner)}
                    </a>
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
            <summary className="cursor-pointer text-muted">From the command line instead</summary>
            <pre className="mt-2 overflow-x-auto rounded-lg bg-background p-3 font-mono text-xs">
              {`CHALLENGER_PRIVATE_KEY=0x… npm run challenge -- --run ${project.id} --target C1 --text "…"
KEEPER_PRIVATE_KEY=0x… npm run extend -- --run ${project.id} --days 90`}
            </pre>
          </details>
        </div>
      </div>
    </section>
  );
}

/** Challenge and keep-alive, signed by the visitor's own wallet on Tiramisu. */
function WalletActions({
  runId,
  targets,
  onChallenged,
  onExtended,
}: {
  runId: string;
  targets: string[];
  onChallenged: () => void;
  onExtended: () => void;
}) {
  const [address, setAddress] = useState<Hex | null>(null);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [busy, setBusy] = useState<"connect" | "challenge" | "extend" | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string; tx?: string } | null>(null);
  const [target, setTarget] = useState(targets[0] ?? "conclusion");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [open, setOpen] = useState(false);

  async function connect() {
    setBusy("connect");
    setMessage(null);
    try {
      const addr = await connectWallet();
      setAddress(addr);
      setBalance(await balanceOf(addr).catch(() => null));
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(null);
    }
  }

  async function challenge() {
    if (!address) return;
    setBusy("challenge");
    setMessage(null);
    try {
      const { txHash } = await fileChallenge(address, { runId, target, text, evidenceUrl: url.trim() || null });
      setMessage({ ok: true, text: "Challenge recorded on Arkiv under your address.", tx: txHash });
      setText("");
      setUrl("");
      onChallenged();
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(null);
    }
  }

  async function extend() {
    if (!address) return;
    setBusy("extend");
    setMessage(null);
    try {
      const { txHash, extended } = await keepAliveFromBrowser(address, runId, 90);
      setMessage({ ok: true, text: `Extended this brief and its facts (${extended} entities) by 90 days from your wallet.`, tx: txHash });
      onExtended();
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(null);
    }
  }

  const btn = "stet-lift rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-40";

  return (
    <div className="mt-6 rounded-xl border border-line bg-background p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="mr-auto text-sm font-semibold">From your own wallet</h3>
        {!address ? (
          <button type="button" onClick={connect} disabled={busy !== null} className={`${btn} bg-primary text-primary-ink`}>
            {busy === "connect" ? "Connecting…" : hasWallet() ? "Connect wallet" : "Connect wallet (needs MetaMask)"}
          </button>
        ) : (
          <span className="flex items-center gap-2 font-mono text-xs text-muted">
            <span className="h-2 w-2 rounded-full bg-good" aria-hidden />
            {short(address)}
            {balance === BigInt(0) && (
              <a href={FAUCET_URL} target="_blank" rel="noreferrer" className="font-sans text-info underline underline-offset-2">
                Get test GLM
              </a>
            )}
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-muted">
        Challenge this brief, or keep it alive, signed by your wallet on Arkiv&apos;s Tiramisu testnet. Stet never holds your key.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => setOpen((v) => !v)} disabled={!address} className={`${btn} border border-line bg-surface`}>
          {open ? "Close challenge form" : "File a challenge"}
        </button>
        <button type="button" onClick={extend} disabled={!address || busy !== null} className={`${btn} border border-line bg-surface`}>
          {busy === "extend" ? "Extending…" : "Keep alive +90 days"}
        </button>
      </div>

      {open && address && (
        <form
          className="stet-rise mt-3 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            challenge();
          }}
        >
          <div className="flex flex-wrap gap-2">
            <label className="text-sm">
              <span className="sr-only">What you challenge</span>
              <select value={target} onChange={(e) => setTarget(e.target.value)} className="rounded-lg border border-line bg-surface px-2 py-1.5 font-mono text-sm">
                {targets.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Link to your evidence (optional)"
              className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm focus:border-sage focus:outline-none"
            />
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="What this brief gets wrong, and why. Public on Arkiv: no personal information."
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm focus:border-sage focus:outline-none"
          />
          <button disabled={busy !== null || text.trim().length < 10} className={`${btn} bg-primary text-primary-ink`}>
            {busy === "challenge" ? "Recording on Arkiv…" : "Record challenge on Arkiv"}
          </button>
        </form>
      )}

      {message && (
        <p className={`stet-pop mt-3 rounded-lg px-3 py-2 text-sm ${message.ok ? "bg-good-soft text-good" : "bg-bad-soft text-bad"}`}>
          {message.text}{" "}
          {message.tx && (
            <a href={`${EXPLORER}/tx/${message.tx}`} target="_blank" rel="noreferrer" className="underline underline-offset-2">
              View transaction
            </a>
          )}
        </p>
      )}
    </div>
  );
}
