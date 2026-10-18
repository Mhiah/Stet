import { randomUUID } from "node:crypto";
import { OutOfCredits } from "./credits";
import type { ReasoningProvider } from "./reasoning/provider";
import { buildWhatChanged, conclude, formThesis, reevaluate, stressTest } from "./reasoning/stages";
import { collectResearch } from "./research/collect";
import type { SearchProvider } from "./research/search";
import type { PipelineEvent, ReasoningAudit, ResearchProject, Stage } from "./types";

export type PipelineDeps = {
  reasoning: ReasoningProvider;
  search: SearchProvider;
  onEvent?: (event: PipelineEvent) => void;
  save?: (project: ResearchProject) => Promise<void>;
  /** Providers to rerun the question with when a live service runs out of credits (the sample data). */
  fallback?: { reasoning: ReasoningProvider; search: SearchProvider };
  /** Why this run is on sample data, when it fell back from a live run. */
  notice?: string;
};

/**
 * Research → Thesis → Stress Test → Re-evaluation → Conclusion → What Changed.
 * Each stage is recorded in the audit trail with the IDs it was given and what it
 * produced. Stages run in order because each one reasons over the ones before it.
 */
export async function runResearch(question: string, deps: PipelineDeps): Promise<ResearchProject> {
  const { reasoning, search, onEvent = () => {}, save } = deps;
  const project: ResearchProject = {
    id: randomUUID(),
    question,
    status: "running",
    created_at: new Date().toISOString(),
    mode: reasoning.mode === "live" && search.mode === "live" ? "live" : "mock",
    research: null,
    thesis: null,
    stress_test: null,
    reevaluation: null,
    conclusion: null,
    what_changed: null,
    audit: [],
    error: null,
    ...(deps.notice ? { notice: deps.notice } : {}),
  };
  onEvent({ type: "project", project: { id: project.id, question, created_at: project.created_at, mode: project.mode } });

  let current: Stage | null = null;
  async function stage<T>(
    name: Stage,
    inputRefs: string[],
    run: () => Promise<{ output: T; model: string | null; warnings: string[] }>,
    apply: (output: T) => void,
  ) {
    current = name;
    onEvent({ type: "stage_started", stage: name });
    const started = Date.now();
    const { output, model, warnings } = await run();
    apply(output);
    const audit: ReasoningAudit = {
      stage: name,
      model,
      started_at: new Date(started).toISOString(),
      duration_ms: Date.now() - started,
      input_refs: inputRefs,
      output,
      warnings,
    };
    project.audit.push(audit);
    onEvent({ type: "stage_completed", stage: name, audit, project: structuredClone(project) });
  }

  try {
    await stage(
      "research",
      [],
      async () => {
        const r = await collectResearch(question, reasoning, search);
        return { output: r.research, model: [...new Set(r.models)].join(", "), warnings: r.warnings };
      },
      (r) => (project.research = r),
    );
    const research = project.research!;
    const claimIds = research.claims.map((c) => c.id);

    await stage("thesis", claimIds, () => formThesis(question, research, reasoning), (t) => (project.thesis = t));
    const thesis = project.thesis!;
    const assumptionIds = thesis.assumptions.map((a) => a.id);

    await stage(
      "stress_test",
      [...claimIds, ...assumptionIds],
      () => stressTest(question, research, thesis, reasoning),
      (s) => (project.stress_test = s),
    );
    const test = project.stress_test!;
    const challengeIds = test.challenges.map((c) => c.id);

    await stage(
      "reevaluation",
      [...claimIds, ...assumptionIds, ...challengeIds],
      () => reevaluate(question, research, thesis, test, reasoning),
      (r) => (project.reevaluation = r),
    );
    const reeval = project.reevaluation!;

    await stage(
      "conclusion",
      [...claimIds, ...assumptionIds, ...challengeIds],
      () => conclude(question, research, thesis, test, reeval, reasoning),
      (c) => (project.conclusion = c),
    );
    const conclusion = project.conclusion!;

    await stage(
      "what_changed",
      [...assumptionIds, ...challengeIds],
      async () => ({ output: buildWhatChanged(thesis, test, reeval, conclusion), model: null, warnings: [] }),
      (w) => (project.what_changed = w),
    );

    project.status = "complete";
  } catch (err) {
    if (err instanceof OutOfCredits && deps.fallback) {
      const notice = `${err.service} credits have run out, so this is the sample report (mock mode), not research on your question.`;
      console.error(err.message);
      onEvent({ type: "fallback", message: notice });
      return runResearch(question, { ...deps, ...deps.fallback, fallback: undefined, notice });
    }
    project.status = "failed";
    project.error = err instanceof Error ? err.message : String(err);
    onEvent({ type: "error", stage: current, message: project.error });
  }

  // A report that can't be saved is still delivered: it streams to the page and downloads as a PDF.
  let saved = false;
  if (save) {
    try {
      await save(project);
      saved = true;
    } catch (err) {
      console.error(`Couldn't save project ${project.id}:`, err);
    }
  }
  onEvent({ type: "done", project, saved });
  return project;
}
