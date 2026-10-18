import type { SourceKind } from "./research/sources";

/**
 * Domain model for a research run. Mirrors the build plan's data model:
 * ResearchProject → Source → Claim → Thesis → StressTest → Reevaluation → Conclusion,
 * with a ReasoningAudit entry per stage.
 *
 * IDs are short and human-readable (S1, C4, A2, X3) because SERV cites them in its
 * output; the pipeline validates every citation against what actually exists.
 */

export type Confidence = "low" | "medium" | "high";

export type Source = {
  id: string; // S1, S2, ...
  url: string;
  title: string;
  publisher: string | null;
  published_date: string | null;
  excerpt: string;
  relevance: number; // 0..1, from the search provider
  /** Publisher type, judged from the web address. */
  kind: SourceKind;
  /** Why this is weak evidence (social post, out of date); empty when it isn't. */
  flags: string[];
};

/** A claim resting only on flagged sources is weak evidence, however it's worded. */
export const weakOnly = (claim: Claim, sources: Source[]) =>
  claim.source_ids.length > 0 && claim.source_ids.every((id) => (sources.find((s) => s.id === id)?.flags ?? []).length > 0);

export type ClaimCategory =
  | "market_demand"
  | "customers"
  | "competition"
  | "pricing"
  | "adoption"
  | "trends"
  | "regulation"
  | "risk"
  | "other";

export type Claim = {
  id: string; // C1, C2, ...
  text: string;
  source_ids: string[]; // only sources whose quote was found in their text
  category: ClaimCategory;
  stance: "supports" | "challenges" | "neutral"; // relative to the question's "yes"
  /** The exact source words the claim rests on, each verified against that source's excerpt. */
  quotes: { source_id: string; text: string }[];
  /** Figures in the claim that none of its quotes contain: kept, but flagged. */
  unmatched_numbers: string[];
};

export type Research = {
  queries: string[];
  sources: Source[];
  claims: Claim[];
  /** Outcome of checking every extracted claim's quotes against its sources. */
  fact_check: {
    extracted: number;
    dropped: number;
    /** Duplicates folded into an earlier fact (absent in runs saved before merging existed). */
    merged?: number;
    flagged: number;
  };
};

export type Assumption = {
  id: string; // A1, A2, ...
  text: string;
  supporting_claim_ids: string[];
};

export type Thesis = {
  statement: string;
  confidence: Confidence;
  confidence_rationale: string;
  assumptions: Assumption[];
  supporting_claim_ids: string[];
  uncertainties: string[];
};

export type ChallengeKind =
  | "weak_assumption"
  | "contradictory_evidence"
  | "alternative_explanation"
  | "risk"
  | "missing_evidence";

export type Challenge = {
  id: string; // X1, X2, ...
  kind: ChallengeKind;
  text: string;
  target_assumption_ids: string[];
  claim_ids: string[];
  severity: "minor" | "major" | "critical";
};

export type StressTest = {
  challenges: Challenge[];
  failure_conditions: string[];
  missing_evidence: { question: string; why_it_matters: string }[];
};

export type AssumptionVerdict = "supported" | "weakened" | "contradicted" | "unresolved";

export type Reevaluation = {
  assessments: {
    assumption_id: string;
    verdict: AssumptionVerdict;
    reasoning: string;
    claim_ids: string[];
    challenge_ids: string[];
  }[];
  thesis_verdict: "strengthened" | "survived" | "weakened" | "overturned";
  revised_statement: string;
  changes: {
    from: string;
    to: string;
    reason: string;
    claim_ids: string[];
    challenge_ids: string[];
  }[];
  unresolved: string[];
};

export type Conclusion = {
  final_statement: string;
  confidence: Confidence;
  confidence_rationale: string;
  key_supporting_claim_ids: string[];
  key_challenging_claim_ids: string[];
  uncertainties: string[];
  next_validation_steps: { step: string; resolves: string }[];
};

/** Assembled from the stages, not generated: every line points back at a recorded artifact. */
export type WhatChanged = {
  initial: { statement: string; confidence: Confidence };
  final: { statement: string; confidence: Confidence };
  verdict: Reevaluation["thesis_verdict"];
  challenged: { challenge_id: string; text: string; severity: Challenge["severity"] }[];
  assumptions: {
    assumption_id: string;
    text: string;
    verdict: AssumptionVerdict;
    reasoning: string;
    claim_ids: string[];
    challenge_ids: string[];
  }[];
  changes: Reevaluation["changes"];
  unresolved: string[];
};

export type Stage = "research" | "thesis" | "stress_test" | "reevaluation" | "conclusion" | "what_changed";

export type ReasoningAudit = {
  stage: Stage;
  model: string | null; // null for stages that don't call SERV
  started_at: string;
  duration_ms: number;
  input_refs: string[]; // ids of the records this stage was given
  output: unknown;
  warnings: string[]; // e.g. citations to ids that don't exist, stripped before saving
};

export type ProjectStatus = "running" | "complete" | "failed";

export type ResearchProject = {
  id: string;
  question: string;
  status: ProjectStatus;
  created_at: string;
  mode: "live" | "mock";
  research: Research | null;
  thesis: Thesis | null;
  stress_test: StressTest | null;
  reevaluation: Reevaluation | null;
  conclusion: Conclusion | null;
  what_changed: WhatChanged | null;
  audit: ReasoningAudit[];
  error: string | null;
  /** Why a mock run is on sample data, when it fell back from a live run that ran out of credits. */
  notice?: string;
};

/** Events streamed to the client as NDJSON while the pipeline runs. */
export type PipelineEvent =
  | { type: "project"; project: Pick<ResearchProject, "id" | "question" | "created_at" | "mode"> }
  | { type: "stage_started"; stage: Stage }
  | { type: "stage_completed"; stage: Stage; audit: ReasoningAudit; project: ResearchProject }
  | { type: "error"; stage: Stage | null; message: string }
  /** A live service ran out of credits; the run restarts on sample data. */
  | { type: "fallback"; message: string }
  /** `saved`: the run can be reopened at /research/:id (false where there is no storage, e.g. Vercel). */
  | { type: "done"; project: ResearchProject; saved: boolean };
