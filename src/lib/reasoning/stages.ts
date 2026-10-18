import type {
  Assumption,
  Challenge,
  Conclusion,
  Reevaluation,
  Research,
  StressTest,
  Thesis,
  WhatChanged,
} from "../types";
import type { ReasoningProvider } from "./provider";
import {
  CONCLUSION_SYSTEM,
  REEVALUATION_SYSTEM,
  STRESS_TEST_SYSTEM,
  THESIS_SYSTEM,
  formatEvidence,
  formatReevaluation,
  formatStressTest,
  formatThesis,
} from "./prompts";
import { CONCLUSION_SCHEMA, REEVALUATION_SCHEMA, STRESS_TEST_SCHEMA, THESIS_SCHEMA } from "./schemas";

export type StageResult<T> = { output: T; model: string; warnings: string[] };

/**
 * Drops IDs that don't exist in `valid`, recording a warning. SERV is told to cite only
 * IDs from its input; this makes sure a slip can never become a dead audit-trail link.
 */
function keepKnown(ids: string[], valid: Set<string>, where: string, warnings: string[]): string[] {
  const unknown = ids.filter((id) => !valid.has(id));
  if (unknown.length) warnings.push(`${where} cited unknown ${unknown.join(", ")}; removed.`);
  return [...new Set(ids.filter((id) => valid.has(id)))];
}

const idSet = (items: { id: string }[]) => new Set(items.map((i) => i.id));

type RawThesis = Omit<Thesis, "assumptions"> & { assumptions: Omit<Assumption, "id">[] };

export async function formThesis(question: string, research: Research, reasoning: ReasoningProvider): Promise<StageResult<Thesis>> {
  const { output, model } = await reasoning.reason<RawThesis>({
    step: "thesis",
    system: THESIS_SYSTEM,
    user: formatEvidence(question, research),
    schema: THESIS_SCHEMA,
  });
  const warnings: string[] = [];
  const claims = idSet(research.claims);
  const thesis: Thesis = {
    ...output,
    supporting_claim_ids: keepKnown(output.supporting_claim_ids, claims, "Thesis", warnings),
    assumptions: output.assumptions.map((a, i) => ({
      id: `A${i + 1}`,
      text: a.text,
      supporting_claim_ids: keepKnown(a.supporting_claim_ids, claims, `Assumption A${i + 1}`, warnings),
    })),
  };
  if (thesis.assumptions.length === 0) throw new Error("The thesis stage returned no assumptions to stress-test.");
  return { output: thesis, model, warnings };
}

type RawStressTest = Omit<StressTest, "challenges"> & { challenges: Omit<Challenge, "id">[] };

export async function stressTest(
  question: string,
  research: Research,
  thesis: Thesis,
  reasoning: ReasoningProvider,
): Promise<StageResult<StressTest>> {
  const { output, model } = await reasoning.reason<RawStressTest>({
    step: "stress_test",
    system: STRESS_TEST_SYSTEM,
    user: `${formatEvidence(question, research)}\n\nThesis under test:\n${formatThesis(thesis)}`,
    schema: STRESS_TEST_SCHEMA,
  });
  const warnings: string[] = [];
  const claims = idSet(research.claims);
  const assumptions = idSet(thesis.assumptions);
  const result: StressTest = {
    ...output,
    challenges: output.challenges.map((c, i) => ({
      ...c,
      id: `X${i + 1}`,
      target_assumption_ids: keepKnown(c.target_assumption_ids, assumptions, `Challenge X${i + 1}`, warnings),
      claim_ids: keepKnown(c.claim_ids, claims, `Challenge X${i + 1}`, warnings),
    })),
  };
  const attacked = new Set(result.challenges.flatMap((c) => c.target_assumption_ids));
  for (const a of thesis.assumptions) {
    if (!attacked.has(a.id)) warnings.push(`Assumption ${a.id} was not challenged by the stress test.`);
  }
  return { output: result, model, warnings };
}

export async function reevaluate(
  question: string,
  research: Research,
  thesis: Thesis,
  test: StressTest,
  reasoning: ReasoningProvider,
): Promise<StageResult<Reevaluation>> {
  const { output, model } = await reasoning.reason<Reevaluation>({
    step: "reevaluation",
    system: REEVALUATION_SYSTEM,
    user: `${formatEvidence(question, research)}\n\nInitial thesis:\n${formatThesis(thesis)}\n\nStress test:\n${formatStressTest(test)}`,
    schema: REEVALUATION_SCHEMA,
  });
  const warnings: string[] = [];
  const claims = idSet(research.claims);
  const challenges = idSet(test.challenges);

  // Exactly one assessment per assumption: drop strays and duplicates, fill gaps as unresolved.
  const byAssumption = new Map<string, Reevaluation["assessments"][number]>();
  for (const a of output.assessments) {
    if (!thesis.assumptions.some((t) => t.id === a.assumption_id)) {
      warnings.push(`Re-evaluation assessed unknown assumption ${a.assumption_id}; removed.`);
      continue;
    }
    if (byAssumption.has(a.assumption_id)) continue;
    byAssumption.set(a.assumption_id, {
      ...a,
      claim_ids: keepKnown(a.claim_ids, claims, `Assessment of ${a.assumption_id}`, warnings),
      challenge_ids: keepKnown(a.challenge_ids, challenges, `Assessment of ${a.assumption_id}`, warnings),
    });
  }
  const assessments = thesis.assumptions.map((t) => {
    const found = byAssumption.get(t.id);
    if (found) return found;
    warnings.push(`Re-evaluation did not assess ${t.id}; marked unresolved.`);
    return { assumption_id: t.id, verdict: "unresolved" as const, reasoning: "Not assessed by the re-evaluation stage.", claim_ids: [], challenge_ids: [] };
  });

  return {
    output: {
      ...output,
      assessments,
      changes: output.changes.map((c, i) => ({
        ...c,
        claim_ids: keepKnown(c.claim_ids, claims, `Change ${i + 1}`, warnings),
        challenge_ids: keepKnown(c.challenge_ids, challenges, `Change ${i + 1}`, warnings),
      })),
    },
    model,
    warnings,
  };
}

export async function conclude(
  question: string,
  research: Research,
  thesis: Thesis,
  test: StressTest,
  reeval: Reevaluation,
  reasoning: ReasoningProvider,
): Promise<StageResult<Conclusion>> {
  const { output, model } = await reasoning.reason<Conclusion>({
    step: "conclusion",
    system: CONCLUSION_SYSTEM,
    user: [
      formatEvidence(question, research),
      `Initial thesis:\n${formatThesis(thesis)}`,
      `Stress test:\n${formatStressTest(test)}`,
      `Re-evaluation:\n${formatReevaluation(reeval)}`,
    ].join("\n\n"),
    schema: CONCLUSION_SCHEMA,
  });
  const warnings: string[] = [];
  const claims = idSet(research.claims);
  return {
    output: {
      ...output,
      key_supporting_claim_ids: keepKnown(output.key_supporting_claim_ids, claims, "Conclusion", warnings),
      key_challenging_claim_ids: keepKnown(output.key_challenging_claim_ids, claims, "Conclusion", warnings),
    },
    model,
    warnings,
  };
}

/**
 * Built from the recorded stages rather than generated, so every line of "What Changed?"
 * is exactly what the reasoning said and links to the claims and challenges behind it.
 */
export function buildWhatChanged(thesis: Thesis, test: StressTest, reeval: Reevaluation, conclusion: Conclusion): WhatChanged {
  const severityRank = { critical: 0, major: 1, minor: 2 } as const;
  return {
    initial: { statement: thesis.statement, confidence: thesis.confidence },
    final: { statement: conclusion.final_statement, confidence: conclusion.confidence },
    verdict: reeval.thesis_verdict,
    challenged: [...test.challenges]
      .sort((a, b) => severityRank[a.severity] - severityRank[b.severity])
      .map((c) => ({ challenge_id: c.id, text: c.text, severity: c.severity })),
    assumptions: reeval.assessments.map((a) => ({
      assumption_id: a.assumption_id,
      text: thesis.assumptions.find((t) => t.id === a.assumption_id)?.text ?? "",
      verdict: a.verdict,
      reasoning: a.reasoning,
      claim_ids: a.claim_ids,
      challenge_ids: a.challenge_ids,
    })),
    changes: reeval.changes,
    unresolved: [...new Set([...reeval.unresolved, ...conclusion.uncertainties])],
  };
}
