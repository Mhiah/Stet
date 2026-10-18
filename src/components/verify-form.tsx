"use client";

import { useState } from "react";
import { Eyebrow } from "./app-shell";
import type { VerifyResult } from "@/lib/arkiv/runs";

/**
 * Check a brief against Arkiv: give its run id or entity key, and optionally drop in a copy of
 * its record (downloaded earlier, or sent to you by someone) to see whether it was changed.
 */
export function VerifyForm({ initialRun = "" }: { initialRun?: string }) {
  const [ref, setRef] = useState(initialRun);
  const [copyText, setCopyText] = useState("");
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function check() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      let copy: unknown;
      if (copyText.trim()) {
        try {
          copy = JSON.parse(copyText);
        } catch {
          throw new Error("The copy isn't valid JSON. Paste or load the record file exactly as downloaded.");
        }
      }
      const r = ref.trim();
      const body = /^0x[0-9a-fA-F]{64}$/.test(r) ? { key: r, copy } : { run_id: r, copy };
      const res = await fetch("/api/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status}).`);
      setResult(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <main className="stet-rise mx-auto w-full max-w-3xl px-5 pt-8 pb-28 sm:px-10 sm:pt-10">
        <Eyebrow>Tamper check</Eyebrow>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">Verify a brief</h1>
        <p className="mt-2 text-sm text-muted">
          Checks the brief on Arkiv still hashes to the value recorded when it was published, and, if you give a copy, whether
          that copy matches it word for word.
        </p>

        <form
          className="mt-6 space-y-4 rounded-2xl border border-line bg-surface p-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (ref.trim()) check();
          }}
        >
          <label className="block text-sm">
            <span className="font-medium">Run id or Arkiv entity key</span>
            <input
              value={ref}
              onChange={(e) => setRef(e.target.value)}
              className="mt-1 w-full rounded-xl border border-line bg-background px-3 py-2.5 font-mono text-sm focus:border-sage focus:outline-none"
              placeholder="e.g. 3f2c…-… or 0x…"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium">Copy of the record (optional)</span>
            <textarea
              value={copyText}
              onChange={(e) => setCopyText(e.target.value)}
              rows={6}
              className="mt-1 w-full rounded-xl border border-line bg-background px-3 py-2.5 font-mono text-xs focus:border-sage focus:outline-none"
              placeholder="Paste the downloaded record JSON, or load the file below"
            />
            <input
              type="file"
              accept="application/json,.json"
              className="mt-2 text-sm text-muted file:mr-3 file:rounded-lg file:border file:border-line file:bg-background file:px-3 file:py-1.5 file:text-sm file:text-foreground"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) setCopyText(await f.text());
              }}
            />
          </label>
          <button className="rounded-xl bg-primary px-5 py-2.5 font-medium text-primary-ink hover:opacity-90 disabled:opacity-40" disabled={busy || !ref.trim()}>
            {busy ? "Checking Arkiv…" : "Verify"}
          </button>
        </form>

        {error && <p className="mt-6 rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{error}</p>}

        {result && !result.found && <p className="stet-pop mt-6 rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">No Stet run with that id or key on Arkiv.</p>}

        {result && result.found && (
          <section className="stet-pop stet-stagger mt-6 space-y-3 rounded-2xl border border-line bg-surface p-5 text-sm">
            <Row ok={result.chain_intact} yes="The brief on Arkiv matches its recorded hash." no="The brief on Arkiv does not match its recorded hash." />
            <Row ok={result.readonly} yes="It is read-only: its content can never be edited, only kept alive longer." no="It is not read-only." />
            {result.copy && (
              <>
                <Row ok={result.copy.matches} yes="Your copy matches the brief on Arkiv exactly." no="Your copy has been changed from the brief on Arkiv." />
                {result.copy.changed.length > 0 && (
                  <div>
                    <p className="font-medium">Changed in your copy:</p>
                    <ul className="mt-1 list-disc pl-5 font-mono text-xs">
                      {result.copy.changed.map((p) => (
                        <li key={p}>{p}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
            <dl className="grid gap-x-4 gap-y-1 pt-2 font-mono text-xs sm:grid-cols-[max-content_1fr]">
              <dt className="text-muted">Entity</dt>
              <dd className="break-all">{result.key}</dd>
              <dt className="text-muted">Recorded SHA-256</dt>
              <dd className="break-all">{result.recorded_sha256}</dd>
              {result.copy && (
                <>
                  <dt className="text-muted">Your copy</dt>
                  <dd className="break-all">{result.copy.sha256}</dd>
                </>
              )}
            </dl>
          </section>
        )}
      </main>
    </>
  );
}

function Row({ ok, yes, no }: { ok: boolean; yes: string; no: string }) {
  return (
    <p className={`flex gap-2 ${ok ? "text-good" : "text-bad"}`}>
      <span aria-hidden>{ok ? "✓" : "✗"}</span>
      <span>{ok ? yes : no}</span>
    </p>
  );
}
