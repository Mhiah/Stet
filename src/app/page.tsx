"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { HomeButton } from "@/components/home-button";
import { SiteHeader } from "@/components/site-header";
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
  const [notice, setNotice] = useState<string | null>(null);
  // Tapping the empty box fills the demo question once; after that a tap just edits.
  const tapFilled = useRef(false);

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
      setActive(null);
    }
  }

  async function run() {
    setRunning(true);
    setProject(null);
    setError(null);
    setMode(null);
    setSaved(false);
    setNotice(null);
    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
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
    setProject(null);
    setError(null);
    setMode(null);
    setSaved(false);
  }

  const header = (
    <SiteHeader onHome={newQuestion} homeDisabled={running}>
      {project && !running && (
        <button type="button" onClick={newQuestion} className="rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-surface">
          New<span className="max-[359px]:hidden"> question</span>
        </button>
      )}
    </SiteHeader>
  );

  // Landing: the name, what Crux does, and the question box.
  if (!running && !project) {
    return (
      <>
        {header}
        <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-5 pt-10 pb-24 sm:pt-16">
          <h1 className="text-center text-4xl font-semibold leading-[1.1] tracking-tight text-balance sm:text-6xl">
            AI research that stress tests its own conclusions.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-center text-lg text-muted text-balance">
            Using SERV Reasoning, Crux forms a thesis, stress tests it against the evidence and audits it.
          </p>

          <form
            className="mt-10 flex flex-col gap-3 rounded-2xl border border-line bg-surface p-2 shadow-sm sm:flex-row"
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
            <button className="rounded-xl bg-foreground px-5 py-3 font-medium text-background transition disabled:opacity-40" disabled={tooShort}>
              Find the crux
            </button>
          </form>

          {error && <p className="mt-4 rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{error}</p>}
        </main>
      </>
    );
  }

  return (
    <>
      {header}
      <main className="mx-auto w-full max-w-4xl px-5 pt-8 pb-28 sm:pt-12">
        <h1 className="text-2xl font-semibold leading-snug tracking-tight print:hidden">{question}</h1>

        {mode === "mock" && (
          <p className="mt-3 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn print:hidden">
            {notice ?? "Mock mode: illustrative fixtures, not real research. No SERV or Tavily calls are made."}
          </p>
        )}

        <div className="mt-6 space-y-2 print:hidden">
          <Progress project={project} active={active} />
          {running && activeLabel && <p className="text-sm text-muted">Working on {activeLabel.toLowerCase()}…</p>}
        </div>

        {error && <p className="mt-4 rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{error}</p>}

        {project && !running && saved && project.status === "complete" && (
          <p className="mt-4 text-sm print:hidden">
            <Link href={`/research/${project.id}`} className="text-info underline underline-offset-2">
              Saved report
            </Link>{" "}
            <span className="text-muted">(reopen or share this run later)</span>
          </p>
        )}

        {project && (
          <div className="mt-8">
            <Workstation project={project} downloadable={!running} />
          </div>
        )}
      </main>
      {!running && <HomeButton onHome={newQuestion} />}
    </>
  );
}
