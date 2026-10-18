"use client";

import { createContext, useContext, useRef, useState, type ReactNode } from "react";
import { RefsProvider, useTrace } from "./refs";
import { claimsBehind, factCheckSummary, recordIds, refsIn, stripRefs } from "@/lib/plain";
import { SOURCE_KIND_LABEL, type SourceKind } from "@/lib/research/sources";
import { weakOnly, type AssumptionVerdict, type Challenge, type Claim, type Confidence, type ResearchProject, type Source, type Stage } from "@/lib/types";

/**
 * The research report, in three views: Answer (what to do and what changed), Reasoning
 * (the stress test and how each assumption held up) and Evidence (every fact with its
 * source quote). Record IDs stay out of the reading views; anything backed by facts gets
 * an "Evidence" link that opens the Evidence view filtered to those facts. The PDF
 * prints all three views in order.
 */

export const STAGES: { key: Stage; label: string }[] = [
  { key: "research", label: "Research" },
  { key: "thesis", label: "Thesis" },
  { key: "stress_test", label: "Stress test" },
  { key: "reevaluation", label: "Re-evaluate" },
  { key: "conclusion", label: "Conclusion" },
  { key: "what_changed", label: "What changed" },
];

type Tone = "good" | "warn" | "bad" | "neutral" | "info";

const TONE: Record<Tone, string> = {
  good: "bg-good-soft text-good",
  warn: "bg-warn-soft text-warn",
  bad: "bg-bad-soft text-bad",
  info: "bg-info-soft text-info",
  neutral: "bg-surface text-muted",
};

function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${TONE[tone]}`}>{children}</span>;
}

const VERDICT_TONE: Record<AssumptionVerdict, Tone> = { supported: "good", weakened: "warn", contradicted: "bad", unresolved: "neutral" };
const THESIS_TONE = { strengthened: "good", survived: "good", weakened: "warn", overturned: "bad" } as const;
const SEVERITY_TONE: Record<Challenge["severity"], Tone> = { minor: "neutral", major: "warn", critical: "bad" };
const STANCE_TONE: Record<Claim["stance"], Tone> = { supports: "good", challenges: "bad", neutral: "neutral" };
const CONFIDENCE_TONE: Record<Confidence, Tone> = { high: "good", medium: "warn", low: "bad" };
const SEVERITY_ORDER = { critical: 0, major: 1, minor: 2 };
const STANCE_LABEL: Record<Claim["stance"], string> = { supports: "for", challenges: "against", neutral: "neutral" };

const human = (s: string) => s.replace(/_/g, " ");

function ConfidenceBadge({ level }: { level: Confidence }) {
  return <Badge tone={CONFIDENCE_TONE[level]}>{level} confidence</Badge>;
}

function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-line p-4 sm:p-5 ${className}`}>{children}</div>;
}

function Heading({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <h2 className="text-lg font-semibold tracking-tight">{children}</h2>
      {aside && <span className="text-sm text-muted">{aside}</span>}
    </div>
  );
}

function Bullets({ items }: { items: string[] }) {
  const { plain } = useNav();
  return (
    <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed">
      {items.map((item, i) => (
        <li key={i}>{plain(item)}</li>
      ))}
    </ul>
  );
}

export function Progress({ project, active }: { project: ResearchProject | null; active: Stage | null }) {
  const done = new Set(project?.audit.map((a) => a.stage));
  return (
    <ol className="flex flex-wrap gap-2 text-sm" aria-label="Pipeline progress">
      {STAGES.map((s, i) => {
        const state = done.has(s.key) ? "done" : active === s.key ? "active" : "waiting";
        return (
          <li
            key={s.key}
            aria-current={state === "active" ? "step" : undefined}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1 ${
              state === "done" ? "border-good/40 text-good" : state === "active" ? "animate-pulse border-foreground/40" : "border-line text-muted"
            }`}
          >
            <span className="font-mono text-xs">{state === "done" ? "✓" : i + 1}</span>
            {s.label}
          </li>
        );
      })}
    </ol>
  );
}

// ---------------------------------------------------------------------------------------
// Views and the "Evidence" link that ties them together

type View = "answer" | "reasoning" | "evidence";
type Focus = { label: string; claimIds: string[] } | null;
type Nav = {
  project: ResearchProject;
  go: (view: View) => void;
  showEvidence: (label: string, ids: string[]) => void;
  /** Text with this run's record IDs (C1, X2, ...) replaced by plain words. */
  plain: (text: string) => string;
};

const NavCtx = createContext<Nav | null>(null);
const useNav = () => useContext(NavCtx)!;

/**
 * "Evidence · 4": the facts behind a point. `ids` can mix any record IDs; IDs cited inside
 * `text` count too. Renders nothing when no facts are behind it.
 */
function EvidenceLink({ label, ids = [], text = "" }: { label: string; ids?: string[]; text?: string }) {
  const { project, showEvidence } = useNav();
  const claimIds = claimsBehind(project, [...ids, ...refsIn(text)]);
  if (claimIds.length === 0) return null;
  return (
    <button
      type="button"
      onClick={() => showEvidence(label, claimIds)}
      className="inline-flex items-center gap-1 rounded-full border border-line px-2.5 py-1 text-xs font-medium text-muted transition hover:border-foreground/30 hover:text-foreground print:hidden"
    >
      Evidence · {claimIds.length}
      <span aria-hidden>→</span>
    </button>
  );
}

const VIEWS: { key: View; label: string }[] = [
  { key: "answer", label: "Answer" },
  { key: "reasoning", label: "Reasoning" },
  { key: "evidence", label: "Evidence" },
];

/** `downloadable` is off while a run is still streaming, so nobody saves half a report. */
export function Workstation({ project, downloadable = true }: { project: ResearchProject; downloadable?: boolean }) {
  const [view, setView] = useState<View>("answer");
  const [focus, setFocus] = useState<Focus>(null);
  const top = useRef<HTMLDivElement>(null);

  const go = (next: View) => {
    setView(next);
    if (next !== "evidence") setFocus(null);
    top.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const known = recordIds(project);
  const nav: Nav = {
    project,
    go,
    plain: (text) => stripRefs(text, known),
    showEvidence: (label, claimIds) => {
      setFocus({ label, claimIds });
      go("evidence");
    },
  };

  const panel = (key: View) => (view === key ? "block" : "hidden print:block");

  return (
    <RefsProvider project={project}>
      <NavCtx.Provider value={nav}>
        <div ref={top} className="scroll-mt-4">
          <PrintHeader project={project} />
          <div className="sticky top-0 z-10 -mx-5 mb-6 flex items-center gap-2 border-b border-line bg-background/90 px-5 py-2 backdrop-blur print:hidden">
            <nav className="flex gap-1" aria-label="Report views">
              {VIEWS.map((v) => (
                <button
                  key={v.key}
                  type="button"
                  aria-current={view === v.key ? "page" : undefined}
                  onClick={() => go(v.key)}
                  className={`rounded-full px-3 py-1.5 text-sm font-medium transition max-[359px]:px-2.5 sm:px-3.5 ${
                    view === v.key ? "bg-foreground text-background" : "text-muted hover:text-foreground"
                  }`}
                >
                  {v.label}
                  {v.key === "evidence" && project.research ? <span className="ml-1 opacity-60 max-[359px]:hidden">{project.research.claims.length}</span> : null}
                </button>
              ))}
            </nav>
            {downloadable && <Downloads project={project} />}
          </div>

          <div className={panel("answer")}>
            <AnswerView project={project} />
          </div>
          <div className={`${panel("reasoning")} print:mt-12`}>
            <ReasoningView project={project} />
          </div>
          <div className={`${panel("evidence")} print:mt-12`}>
            <EvidenceView project={project} focus={focus} clearFocus={() => setFocus(null)} />
          </div>
        </div>
      </NavCtx.Provider>
    </RefsProvider>
  );
}

const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "research";

/** Nothing is stored for anyone: the report leaves the page as a PDF. */
function Downloads({ project }: { project: ResearchProject }) {
  const filename = `crux-${slug(project.question)}-${project.created_at.slice(0, 10)}`;
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  function save(blob: Blob, name: string) {
    const url = URL.createObjectURL(blob);
    Object.assign(document.createElement("a"), { href: url, download: name }).click();
    setTimeout(() => URL.revokeObjectURL(url), 60_000); // some mobile browsers read it after the click
  }

  async function downloadPdf() {
    setBusy(true);
    setFailed(false);
    try {
      // react-pdf is only fetched when someone actually downloads.
      const { reportPdfBlob } = await import("./report-pdf");
      save(await reportPdfBlob(project), `${filename}.pdf`);
    } catch (err) {
      console.error(err);
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ml-auto flex items-center gap-1">
      {failed && <span className="text-xs text-bad">PDF failed, try again</span>}
      <button
        type="button"
        onClick={downloadPdf}
        disabled={busy}
        aria-label="Download PDF"
        className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm font-medium text-muted hover:bg-surface hover:text-foreground disabled:opacity-60 sm:px-3"
      >
        {/* Icon only on phones, where the tabs leave no room for the word. */}
        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] sm:hidden" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
        </svg>
        <span className={busy ? "" : "hidden sm:inline"}>{busy ? "Preparing…" : "Download"}</span>
      </button>
    </div>
  );
}

/** Only in the PDF: what was asked, when, and whether it was a mock run. */
function PrintHeader({ project }: { project: ResearchProject }) {
  return (
    <header className="mb-8 hidden print:block">
      <p className="text-sm font-semibold">Crux research report</p>
      <h1 className="mt-1 text-2xl font-semibold leading-snug">{project.question}</h1>
      <p className="mt-1 text-sm text-muted">
        {new Date(project.created_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC
        {project.mode === "mock" && " · mock run: illustrative fixtures, not real research"}
      </p>
    </header>
  );
}

function Waiting({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">{children}</p>;
}

function NextButton({ to, children }: { to: View; children: ReactNode }) {
  const { go } = useNav();
  return (
    <button type="button" onClick={() => go(to)} className="rounded-full border border-line px-4 py-2 text-sm font-medium hover:bg-surface print:hidden">
      {children} <span aria-hidden>→</span>
    </button>
  );
}

// ---------------------------------------------------------------------------------------
// Answer: the conclusion, what changed, and what to do next

function AnswerView({ project }: { project: ResearchProject }) {
  const { plain } = useNav();
  const c = project.conclusion;
  const wc = project.what_changed;
  const verdict = project.reevaluation?.thesis_verdict;
  if (!c) return <Waiting>The answer appears once the thesis has been stress-tested and re-evaluated.</Waiting>;

  return (
    <div className="space-y-10">
      <section>
        <div className="flex flex-wrap items-center gap-2">
          <ConfidenceBadge level={c.confidence} />
          {verdict && <Badge tone={THESIS_TONE[verdict]}>thesis {verdict} by the stress test</Badge>}
        </div>
        <p className="mt-4 text-xl leading-relaxed font-medium tracking-tight sm:text-2xl">{plain(c.final_statement)}</p>
        <p className="mt-4 leading-relaxed text-muted">{plain(c.confidence_rationale)}</p>
        <div className="mt-4">
          <EvidenceLink label="the answer" ids={[...c.key_supporting_claim_ids, ...c.key_challenging_claim_ids]} text={c.confidence_rationale} />
        </div>
      </section>

      {wc && (
        <section>
          <Heading aside={`${wc.challenged.length} challenges raised`}>What changed?</Heading>
          <div className="grid gap-3 sm:grid-cols-2">
            <Card>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold text-muted">First answer</h3>
                <ConfidenceBadge level={wc.initial.confidence} />
              </div>
              <p className="mt-2 text-sm leading-relaxed text-muted">{plain(wc.initial.statement)}</p>
            </Card>
            <Card className="border-foreground/25">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold">After the stress test</h3>
                <ConfidenceBadge level={wc.final.confidence} />
              </div>
              <p className="mt-2 text-sm leading-relaxed">{plain(wc.final.statement)}</p>
            </Card>
          </div>

          {wc.changes.length > 0 ? (
            <>
              <h3 className="mt-6 text-sm font-semibold">Why it changed</h3>
              <ol className="mt-3 space-y-3">
                {wc.changes.map((ch, i) => (
                  <li key={i}>
                    <Card>
                      <p className="text-sm text-muted line-through decoration-muted/40">{plain(ch.from)}</p>
                      <p className="mt-1 text-sm font-medium">→ {plain(ch.to)}</p>
                      <p className="mt-2 text-sm leading-relaxed text-muted">{plain(ch.reason)}</p>
                      <div className="mt-3">
                        <EvidenceLink label={`“${plain(ch.to)}”`} ids={[...ch.claim_ids, ...ch.challenge_ids]} text={ch.reason} />
                      </div>
                    </Card>
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <p className="mt-4 text-sm text-muted">The thesis survived the stress test without material changes.</p>
          )}
        </section>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <h3 className="text-sm font-semibold">Next steps to validate</h3>
          <ol className="mt-3 list-decimal space-y-3 pl-5 text-sm leading-relaxed">
            {c.next_validation_steps.map((s, i) => (
              <li key={i}>
                {plain(s.step)}
                <p className="mt-0.5 text-muted">Settles: {plain(s.resolves)}</p>
              </li>
            ))}
          </ol>
        </Card>
        <Card>
          <h3 className="mb-3 text-sm font-semibold">Still uncertain</h3>
          <Bullets items={c.uncertainties} />
        </Card>
      </div>

      <div className="flex flex-wrap gap-2">
        <NextButton to="reasoning">See the reasoning</NextButton>
        <NextButton to="evidence">Check the evidence</NextButton>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------
// Reasoning: the stress test, how each assumption held up, and the first thesis

function ReasoningView({ project }: { project: ResearchProject }) {
  const { plain } = useNav();
  const t = project.thesis;
  const st = project.stress_test;
  const re = project.reevaluation;
  if (!t) return <Waiting>The reasoning appears here as soon as the first thesis is formed.</Waiting>;
  const assumptionText = (id: string) => plain(t.assumptions.find((a) => a.id === id)?.text ?? "");

  return (
    <div className="space-y-10">
      <section>
        <Heading aside={<ConfidenceBadge level={t.confidence} />}>The first answer</Heading>
        <p className="leading-relaxed">{plain(t.statement)}</p>
        <p className="mt-3 text-sm leading-relaxed text-muted">{plain(t.confidence_rationale)}</p>
        <div className="mt-3">
          <EvidenceLink label="the first answer" ids={t.supporting_claim_ids} text={t.confidence_rationale} />
        </div>
      </section>

      {st ? (
        <section>
          <Heading aside="How the first answer held up when stress-tested against the evidence">Stress test</Heading>
          <ol className="space-y-3">
            {[...st.challenges]
              .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
              .map((x) => (
                <li key={x.id}>
                  <Card>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={SEVERITY_TONE[x.severity]}>{x.severity}</Badge>
                      <span className="text-xs text-muted">{human(x.kind)}</span>
                    </div>
                    <p className="mt-2 text-sm leading-relaxed">{plain(x.text)}</p>
                    {x.target_assumption_ids.length > 0 && (
                      <p className="mt-2 text-xs text-muted">
                        Challenges: {x.target_assumption_ids.map((id) => `“${assumptionText(id)}”`).join(" · ")}
                      </p>
                    )}
                    <div className="mt-3">
                      <EvidenceLink label="this challenge" ids={x.claim_ids} text={x.text} />
                    </div>
                  </Card>
                </li>
              ))}
          </ol>
        </section>
      ) : (
        <Waiting>The stress test is running.</Waiting>
      )}

      <section>
        <Heading aside={re ? "Re-judged after the stress test" : "Waiting for the re-evaluation"}>Assumptions</Heading>
        <ul className="divide-y divide-line rounded-xl border border-line">
          {t.assumptions.map((a) => {
            const verdict = re?.assessments.find((x) => x.assumption_id === a.id);
            return (
              <li key={a.id} className="p-4">
                <div className="flex items-start gap-3">
                  <p className="flex-1 text-sm font-medium leading-relaxed">{plain(a.text)}</p>
                  {verdict && <Badge tone={VERDICT_TONE[verdict.verdict]}>{verdict.verdict}</Badge>}
                </div>
                {verdict && <p className="mt-2 text-sm leading-relaxed text-muted">{plain(verdict.reasoning)}</p>}
                <div className="mt-3">
                  <EvidenceLink label={`“${plain(a.text)}”`} ids={[a.id, ...(verdict?.challenge_ids ?? [])]} text={verdict?.reasoning} />
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {st && (st.failure_conditions.length > 0 || st.missing_evidence.length > 0) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {st.failure_conditions.length > 0 && (
            <Card>
              <h3 className="mb-3 text-sm font-semibold">The answer fails if…</h3>
              <Bullets items={st.failure_conditions} />
            </Card>
          )}
          {st.missing_evidence.length > 0 && (
            <Card>
              <h3 className="mb-3 text-sm font-semibold">Missing evidence</h3>
              <ul className="space-y-3 text-sm leading-relaxed">
                {st.missing_evidence.map((m, i) => (
                  <li key={i}>
                    {plain(m.question)}
                    <p className="mt-0.5 text-muted">{plain(m.why_it_matters)}</p>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}

      {re && re.unresolved.length > 0 && (
        <section>
          <Heading>What the evidence can&apos;t settle</Heading>
          <Bullets items={re.unresolved} />
        </section>
      )}

      <Log project={project} />
    </div>
  );
}

function Log({ project }: { project: ResearchProject }) {
  if (project.audit.length === 0) return null;
  const warnings = project.audit.reduce((n, a) => n + a.warnings.length, 0);
  return (
    <details className="rounded-xl border border-line p-4 text-sm print:hidden">
      <summary className="cursor-pointer font-medium">
        Technical log <span className="font-normal text-muted">· {warnings ? `${warnings} warning${warnings === 1 ? "" : "s"}` : "no warnings"}</span>
      </summary>
      <ul className="mt-3 space-y-3">
        {project.audit.map((a) => (
          <li key={a.stage}>
            <p>
              <span className="font-medium">{STAGES.find((s) => s.key === a.stage)?.label}</span>{" "}
              <span className="text-xs text-muted">
                {(a.duration_ms / 1000).toFixed(1)}s{a.model ? ` · ${a.model}` : " · assembled, no model call"}
              </span>
            </p>
            {a.warnings.map((w) => (
              <p key={w} className="mt-1 text-xs text-warn">
                {w}
              </p>
            ))}
          </li>
        ))}
      </ul>
    </details>
  );
}

// ---------------------------------------------------------------------------------------
// Evidence: every fact, its exact source quote, and the sources

const STANCES = ["all", "supports", "challenges", "neutral"] as const;

function EvidenceView({ project, focus, clearFocus }: { project: ResearchProject; focus: Focus; clearFocus: () => void }) {
  const { plain } = useNav();
  const r = project.research;
  const [stance, setStance] = useState<(typeof STANCES)[number]>("all");
  const trace = useTrace();
  if (!r) return <Waiting>The evidence appears here once the research stage finishes.</Waiting>;

  const sourceById = new Map(r.sources.map((s) => [s.id, s]));
  const inFocus = (c: Claim) => !focus || focus.claimIds.includes(c.id);
  const shown = (c: Claim) => inFocus(c) && (stance === "all" || c.stance === stance);
  const count = (s: (typeof STANCES)[number]) => r.claims.filter((c) => inFocus(c) && (s === "all" || c.stance === s)).length;

  return (
    <div className="space-y-8">
      <section>
        <Heading aside={`${r.claims.length} facts from ${r.sources.length} sources`}>Evidence</Heading>
        {r.fact_check && <FactCheckSummary check={r.fact_check} />}
        {!r.claims.some((c) => c.stance === "challenges") && (
          <p className="mb-3 rounded-xl bg-warn-soft px-4 py-3 text-sm text-warn">
            No evidence against a &ldquo;yes&rdquo; answer was found in the sources. That is a gap in the research, not proof: the stress test had
            only reasoning to work with.
          </p>
        )}
        <SourceMix sources={r.sources} />
      </section>

      <section>
        {focus && (
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl bg-info-soft px-4 py-3 text-sm text-info print:hidden">
            <span className="flex-1">
              Showing the {focus.claimIds.length} fact{focus.claimIds.length === 1 ? "" : "s"} behind {focus.label}
            </span>
            <button type="button" onClick={clearFocus} className="font-medium underline underline-offset-2">
              Show all
            </button>
          </div>
        )}

        <div className="flex flex-wrap gap-2 print:hidden" role="group" aria-label="Filter facts by stance">
          {STANCES.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={stance === s}
              onClick={() => setStance(s)}
              className={`rounded-full border px-3 py-1 text-sm ${stance === s ? "border-foreground bg-foreground text-background" : "border-line text-muted hover:text-foreground"}`}
            >
              {s === "all" ? "All" : s === "supports" ? "For" : s === "challenges" ? "Against" : "Neutral"} · {count(s)}
            </button>
          ))}
        </div>

        <ul className="mt-4 space-y-3">
          {r.claims.map((c) => (
            <li key={c.id} className={shown(c) ? "block" : "hidden print:block"}>
              <Card>
                <p className="text-sm font-medium leading-relaxed">{plain(c.text)}</p>
                {c.quotes?.map((q, i) => {
                  const s = sourceById.get(q.source_id);
                  return (
                    <blockquote key={i} className="mt-2 border-l-2 border-line pl-3 text-sm leading-relaxed text-muted">
                      &ldquo;{q.text}&rdquo;
                      {s && (
                        <a href={s.url} target="_blank" rel="noreferrer" className="ml-1 whitespace-nowrap text-xs text-info hover:underline">
                          {s.publisher ?? "source"} ↗
                        </a>
                      )}
                    </blockquote>
                  );
                })}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Badge tone={STANCE_TONE[c.stance]}>{STANCE_LABEL[c.stance]}</Badge>
                  <span className="text-xs text-muted">{human(c.category)}</span>
                  {r.sources.every((s) => s.flags) && weakOnly(c, r.sources) && <Badge tone="warn">weak sources only</Badge>}
                  {c.unmatched_numbers?.length > 0 && <Badge tone="warn">figures not in source: {c.unmatched_numbers.join(", ")}</Badge>}
                  {/* Projects saved before fact checking have no quotes; name their sources instead. */}
                  {!c.quotes && <span className="text-xs text-muted">{c.source_ids.map((id) => sourceById.get(id)?.publisher ?? id).join(", ")}</span>}
                  <button
                    type="button"
                    onClick={() => trace(c.id)}
                    className="ml-auto text-xs font-medium text-muted underline-offset-2 hover:text-foreground hover:underline print:hidden"
                  >
                    Where it&apos;s used
                  </button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <Heading>Sources</Heading>
        <ul className="grid gap-2 sm:grid-cols-2">
          {r.sources.map((s) => (
            <li key={s.id} className="rounded-xl border border-line p-3 text-sm">
              <a href={s.url} target="_blank" rel="noreferrer" className="line-clamp-2 font-medium hover:underline">
                {s.title}
              </a>
              <p className="mt-0.5 truncate text-xs text-muted">{[s.publisher, s.published_date].filter(Boolean).join(" · ")}</p>
              {s.kind && (
                <p className="mt-2 flex flex-wrap gap-1">
                  <Badge tone="neutral">{SOURCE_KIND_LABEL[s.kind]}</Badge>
                  {s.flags.map((f) => (
                    <Badge key={f} tone="warn">
                      {f}
                    </Badge>
                  ))}
                </p>
              )}
            </li>
          ))}
        </ul>
        <details className="mt-4 text-sm print:hidden">
          <summary className="cursor-pointer text-muted">Search queries ({r.queries.length})</summary>
          <ul className="mt-2 list-disc pl-5 text-muted">
            {r.queries.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
        </details>
      </section>
    </div>
  );
}

const KIND_ORDER: SourceKind[] = ["research", "government", "industry_report", "news", "reference", "company_or_blog", "social", "mock"];

/** What the evidence is built on: how many sources of each type, and how many are weak. */
function SourceMix({ sources }: { sources: Source[] }) {
  if (!sources.every((s) => s.kind)) return null; // saved before source labels existed
  const counts = KIND_ORDER.map((k) => [k, sources.filter((s) => s.kind === k).length] as const).filter(([, n]) => n > 0);
  const weak = sources.filter((s) => s.flags.length > 0).length;
  return (
    <p className="text-sm text-muted">
      <span className="font-medium text-foreground">Sources:</span> {counts.map(([k, n]) => `${n} ${SOURCE_KIND_LABEL[k]}`).join(" · ")}
      {weak > 0 && <span className="text-warn"> · {weak} flagged as weak</span>}
    </p>
  );
}

function FactCheckSummary({ check }: { check: NonNullable<ResearchProject["research"]>["fact_check"] }) {
  return (
    <p className="mb-3 rounded-xl bg-surface px-4 py-3 text-sm">
      <span className="font-medium">Fact-checked.</span>{" "}
      <span className="text-muted">
        Each fact is matched to the exact words in its source.{" "}
        {factCheckSummary(check)}
      </span>
    </p>
  );
}
