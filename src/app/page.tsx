"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AppShell, Eyebrow } from "@/components/app-shell";
import { Progress, STAGES, Workstation } from "@/components/workstation";
import type { PipelineEvent, ResearchProject, Stage } from "@/lib/types";

/**
 * Shown faintly as the box's placeholder; pressing → (or Tab) in the empty box fills it in,
 * and so does tapping the empty box on a touchscreen.
 * Nothing runs, and no credits are spent, until the button is pressed.
 */
const DEMO_QUESTION = "Are small businesses actually willing to accept crypto payments?";

/** Ask a question and watch the report fill in stage by stage as the pipeline streams. */
export default function Home() {
  const [question, setQuestion] = useState("");
  const [running, setRunning] = useState(false);
  const [active, setActive] = useState<Stage | null>(null);
  const [project, setProject] = useState<ResearchProject | null>(null);
  const [mode, setMode] = useState<"live" | "mock" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Tapping the empty box fills the demo question once; after that a tap just edits.
  const tapFilled = useRef(false);
  // Set when re-running an earlier run as a revision (/?revise=<run id>). The original stays on Arkiv unchanged.
  const [revising, setRevising] = useState<string | null>(null);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("revise");
    if (!id || !/^[0-9a-f-]{36}$/.test(id)) return;
    fetch(`/api/research/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((p: ResearchProject | null) => {
        if (!p) return;
        setQuestion(p.question);
        setRevising(id);
      })
      .catch(() => {});
  }, []);

  function handle(event: PipelineEvent) {
    if (event.type === "project") {
      // A fallback run starts over, so drop anything the live attempt had shown.
      setMode(event.project.mode);
      setProject(null);
    }
    if (event.type === "fallback") setNotice(event.message);
    if (event.type === "stage_started") setActive(event.stage);
    if (event.type === "stage_completed") setProject(event.project);
    if (event.type === "error") setError(`${STAGES.find((s) => s.key === event.stage)?.label ?? "The pipeline"} failed: ${event.message}`);
    if (event.type === "done") {
      setProject(event.project);
      setSaved(event.saved);
      setSaveError(event.save_error ?? null);
      setActive(null);
    }
  }

  async function run() {
    setRunning(true);
    setProject(null);
    setError(null);
    setMode(null);
    setSaved(false);
    setSaveError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(revising ? { question, supersedes: revising } : { question }),
      });
      if (!res.ok || !res.body) {
        setError(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? `Request failed (${res.status}).`);
        return;
      }
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) if (line.trim()) handle(JSON.parse(line) as PipelineEvent);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
      setActive(null);
    }
  }

  const activeLabel = STAGES.find((s) => s.key === active)?.label;
  const tooShort = question.trim().length < 10;

  function newQuestion() {
    setRevising(null);
    setProject(null);
    setError(null);
    setMode(null);
    setSaved(false);
  }

  const newRunButton = project && !running && (
    <button type="button" onClick={newQuestion} className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm hover:border-sage">
      New question
    </button>
  );

  // Landing: what Stet does, and the question box.
  if (!running && !project) {
    return (
      <AppShell onHome={newQuestion}>
        <main className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-12 px-5 py-10 sm:px-10 sm:py-16 lg:grid-cols-[1.15fr_0.85fr]">
          <div>
            <Eyebrow>Verifiable research · Recorded on Arkiv</Eyebrow>
            <h1 className="mt-5 text-4xl font-semibold leading-[1.05] tracking-tight text-balance sm:text-6xl">
              Research briefs that can&apos;t be quietly <span className="text-muted/70">rewritten or removed.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg text-muted">
              Stet forms a thesis, stress tests it against the evidence, and records the whole brief on Arkiv, where
              anyone can verify it, keep it alive or challenge it.
            </p>

            <form
              className="mt-8 flex flex-col gap-2 rounded-2xl border border-line bg-surface p-2 shadow-[0_1px_0_rgb(7_11_7/0.04),0_12px_32px_-16px_rgb(7_11_7/0.18)] sm:flex-row"
              onSubmit={(e) => {
                e.preventDefault();
                if (!tooShort) run();
              }}
            >
              {/* A textarea so a long question wraps on phones instead of being cut off; Enter still submits. */}
              <textarea
                rows={1}
                className="min-w-0 flex-1 resize-none bg-transparent px-3 py-3 text-base leading-snug [field-sizing:content] placeholder:text-muted/60 focus:outline-none max-sm:min-h-[4.5rem]"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onPointerDown={(e) => {
                  if (!question && e.pointerType === "touch" && !tapFilled.current) {
                    tapFilled.current = true;
                    setQuestion(DEMO_QUESTION);
                  }
                }}
                onKeyDown={(e) => {
                  if (!question && (e.key === "ArrowRight" || e.key === "Tab")) {
                    e.preventDefault();
                    setQuestion(DEMO_QUESTION);
                    return;
                  }
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (!tooShort) run();
                  }
                }}
                placeholder={DEMO_QUESTION}
                aria-label="Your question"
                maxLength={500}
              />
              <button
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 font-medium text-primary-ink transition hover:opacity-90 disabled:opacity-40"
                disabled={tooShort}
              >
                Run and record <span aria-hidden>→</span>
              </button>
            </form>
            <p className="mt-3 text-sm text-muted">
              Press <kbd className="rounded border border-line bg-surface px-1.5 font-mono text-xs">→</kbd> to try the example question.
            </p>

            {revising && (
              <p className="mt-4 rounded-lg bg-info-soft px-3 py-2 text-sm text-info">
                Re-running as a revision of an earlier run. The earlier run stays on Arkiv exactly as it was; this one is
                recorded beside it and linked to it.{" "}
                <button type="button" className="underline underline-offset-2" onClick={() => setRevising(null)}>
                  Make it a new run instead
                </button>
              </p>
            )}
            {error && <p className="mt-4 rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{error}</p>}
          </div>

          <ExampleCard />

          <ol className="grid gap-3 sm:grid-cols-3 lg:col-span-2">
            {[
              ["01", "Stress tested", "A first answer, then the strongest case against it, and every assumption re-judged."],
              ["02", "Recorded, read-only", "The whole brief goes to Arkiv. Nobody can edit it afterwards, Stet included."],
              ["03", "Open to challenge", "Anyone can verify a copy, keep the brief alive, or file a counter-claim from their own wallet."],
            ].map(([n, t, d]) => (
              <li key={n} className="rounded-2xl border border-line bg-surface p-5">
                <p className="font-mono text-xs text-sage">{n}</p>
                <p className="mt-3 font-semibold">{t}</p>
                <p className="mt-1 text-sm text-muted">{d}</p>
              </li>
            ))}
          </ol>
        </main>
      </AppShell>
    );
  }

  return (
    <AppShell onHome={running ? undefined : newQuestion} actions={newRunButton}>
      <main className="mx-auto w-full max-w-4xl px-5 pt-8 pb-28 sm:px-10 sm:pt-10">
        <Eyebrow>{running ? "Running" : "Research brief"}</Eyebrow>
        <h1 className="mt-3 text-2xl font-semibold leading-snug tracking-tight sm:text-3xl print:hidden">{question}</h1>

        {mode === "mock" && (
          <p className="mt-3 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn print:hidden">
            {notice ?? "Sample research: illustrative data, not real research on your question. No SERV or Tavily calls are made."}
          </p>
        )}

        <div className="mt-6 space-y-2 print:hidden">
          <Progress project={project} active={active} />
          {running && activeLabel && <p className="text-sm text-muted">Working on {activeLabel.toLowerCase()}…</p>}
        </div>

        {error && <p className="mt-4 rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{error}</p>}

        {project && !running && saved && project.status === "complete" && (
          <Link
            href={`/research/${project.id}`}
            className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border border-line bg-brand px-4 py-3 text-sm text-brand-ink transition hover:bg-brand/90 print:hidden"
          >
            <span className="flex items-center gap-2 font-medium">
              <span className="h-2 w-2 rounded-full bg-mint" aria-hidden />
              {project.arkiv ? "Recorded on Arkiv" : "Saved report"}
            </span>
            <span className="min-w-0 truncate font-mono text-xs text-brand-muted">
              {project.arkiv ? `entity ${project.arkiv.key.slice(0, 18)}…` : "saved locally for development; not on Arkiv"}
            </span>
            <span className="ml-auto text-mint">Open the record →</span>
          </Link>
        )}
        {project && !running && !saved && project.status === "complete" && (
          <p className="mt-4 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn print:hidden">
            Not recorded on Arkiv{saveError ? `: ${saveError}` : " (this deployment has no ARKIV_PRIVATE_KEY)"}. The report below
            still downloads as a PDF.
          </p>
        )}

        {project && (
          <div className="mt-8">
            <Workstation project={project} downloadable={!running} />
          </div>
        )}
      </main>
    </AppShell>
  );
}

/** An illustration of a recorded brief, beside the question box. Labelled as an example. */
function ExampleCard() {
  return (
    <div aria-hidden className="relative hidden lg:block">
      <div className="absolute -inset-6 -z-10 rounded-[2rem] bg-mint-soft" />
      <div className="rounded-2xl border border-line bg-surface p-5 shadow-[0_24px_48px_-24px_rgb(7_11_7/0.25)]">
        <div className="flex items-center justify-between">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">Example brief</p>
          <span className="flex items-center gap-1.5 rounded-full bg-mint-soft px-2 py-0.5 text-xs font-medium text-good">
            <span className="h-1.5 w-1.5 rounded-full bg-good" /> Hash intact
          </span>
        </div>
        <p className="mt-4 font-semibold leading-snug">Do DAO treasuries actually follow their published spending plans?</p>
        <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
          <span className="rounded-full bg-warn-soft px-2 py-0.5 text-warn">medium confidence</span>
          <span className="rounded-full bg-bad-soft px-2 py-0.5 text-bad">thesis weakened</span>
        </div>
        <dl className="mt-5 divide-y divide-line rounded-xl border border-line text-sm">
          {[
            ["Facts", "16 checked against their sources"],
            ["Challenges raised", "5, one critical"],
            ["Entity", "0xb860…72fb"],
            ["Status", "Read-only on Arkiv"],
          ].map(([k, v]) => (
            <div key={k} className="flex items-center justify-between gap-4 px-3 py-2">
              <dt className="text-muted">{k}</dt>
              <dd className={k === "Entity" ? "font-mono text-xs" : ""}>{v}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-4 rounded-xl border border-line bg-brand p-3 text-xs text-brand-ink">
          <p className="flex items-center gap-2 font-medium">
            <span className="h-1.5 w-1.5 rounded-full bg-mint" /> Challenge filed · independent wallet
          </p>
          <p className="mt-1 text-brand-muted">&ldquo;Two of the cited votes were later reversed on-chain.&rdquo;</p>
        </div>
      </div>
    </div>
  );
}
