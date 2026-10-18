import { SERV_SOURCE_KINDS } from "../research/sources";

/**
 * Strict JSON schemas for each SERV call. Strict mode requires every property to be
 * listed in `required` and `additionalProperties: false`, so objects go through `obj`.
 */

type JsonSchema = Record<string, unknown>;

const str = (description?: string): JsonSchema => ({ type: "string", ...(description && { description }) });
const strEnum = (values: readonly string[], description?: string): JsonSchema => ({
  type: "string",
  enum: values,
  ...(description && { description }),
});
const arr = (items: JsonSchema, description?: string): JsonSchema => ({
  type: "array",
  items,
  ...(description && { description }),
});
const ids = (prefix: string, what: string) => arr(str(), `IDs of ${what} (e.g. ${prefix}1, ${prefix}2). Only use IDs that appear in the input.`);
const obj = (properties: Record<string, JsonSchema>, description?: string): JsonSchema => ({
  type: "object",
  additionalProperties: false,
  properties,
  required: Object.keys(properties),
  ...(description && { description }),
});

export type StrictSchema = { name: string; strict: true; schema: JsonSchema };
const schema = (name: string, root: JsonSchema): StrictSchema => ({ name, strict: true, schema: root });

const CONFIDENCE = ["low", "medium", "high"] as const;
const CLAIM_CATEGORIES = [
  "market_demand",
  "customers",
  "competition",
  "pricing",
  "adoption",
  "trends",
  "regulation",
  "risk",
  "other",
] as const;

export const QUERY_PLAN_SCHEMA = schema(
  "query_plan",
  obj({
    supporting_queries: arr(str(), "2-4 distinct web search queries for evidence that the answer is YES: demand, customers, adoption, growth, pricing that works."),
    challenging_queries: arr(
      str(),
      "3-4 distinct web search queries for evidence that the answer is NO: failures and shutdowns, low or falling adoption, complaints and critics, costs and risks, regulation that blocks it, cheaper alternatives. Phrase them to find that evidence, not to confirm the idea.",
    ),
  }),
);

export const CLAIMS_SCHEMA = schema(
  "claims",
  obj({
    claims: arr(
      obj({
        text: str("One specific, checkable factual claim stated in the source excerpts, written as a plain statement in your own words (\"34% of small businesses accept crypto\", not \"The source says that ...\"). No quotation marks: the source's exact words go in quotes. Include numbers and dates when the source gives them. No opinions of your own."),
        quotes: arr(
          obj({
            source_id: str("The ID of the source this quote comes from (e.g. S3). Only use IDs that appear in the input."),
            text: str("The exact words from that source's excerpt that state the claim, copied character for character. At least one full clause; use ... only to skip words inside the same excerpt."),
          }),
          "One quote per source that states this claim. Quotes are checked against the source text; a claim with no quote found in its source is discarded.",
        ),
        category: strEnum(CLAIM_CATEGORIES),
        stance: strEnum(["supports", "challenges", "neutral"], "Relative to answering the research question 'yes'."),
      }),
    ),
    sources: arr(
      obj({
        source_id: str("A source ID from the input (e.g. S3)."),
        kind: strEnum(
          SERV_SOURCE_KINDS,
          "The publisher's type: research (academic or independent research), government (regulators, central banks, public bodies, multilaterals), industry_report (market research, consultancies, analytics firms), news (newsrooms and trade press), reference (encyclopedias, explainers), company_or_blog (a company's own site, product pages, vendor blogs), social (social media, forums, user-generated posts).",
        ),
      }),
      "The publisher type of every source in the input, one entry each.",
    ),
  }),
);

export const THESIS_SCHEMA = schema(
  "thesis",
  obj({
    statement: str("The strongest initial thesis the evidence supports, in one or two sentences. This is a starting position, not a final answer."),
    confidence: strEnum(CONFIDENCE),
    confidence_rationale: str("Why this confidence level, citing claim IDs."),
    assumptions: arr(
      obj({
        text: str("An assumption the thesis depends on. Make hidden assumptions explicit."),
        supporting_claim_ids: ids("C", "claims supporting this assumption; empty if it is unsupported"),
      }),
      "3-6 load-bearing assumptions. If any one failed, the thesis would weaken.",
    ),
    supporting_claim_ids: ids("C", "claims that most directly support the thesis"),
    uncertainties: arr(str(), "What is not yet known that could change the thesis."),
  }),
);

export const STRESS_TEST_SCHEMA = schema(
  "stress_test",
  obj({
    challenges: arr(
      obj({
        kind: strEnum(["weak_assumption", "contradictory_evidence", "alternative_explanation", "risk", "missing_evidence"]),
        text: str("The challenge, stated as sharply as a skeptical investor would."),
        target_assumption_ids: ids("A", "assumptions this challenge attacks"),
        claim_ids: ids("C", "claims that ground this challenge; empty for pure missing-evidence challenges"),
        severity: strEnum(["minor", "major", "critical"], "critical = would overturn the thesis if true."),
      }),
      "The strongest 4-8 challenges. Attack every assumption at least once.",
    ),
    failure_conditions: arr(str(), "Concrete conditions under which the thesis would be wrong."),
    missing_evidence: arr(
      obj({
        question: str("A question the research could not answer."),
        why_it_matters: str(),
      }),
    ),
  }),
);

export const REEVALUATION_SCHEMA = schema(
  "reevaluation",
  obj({
    assessments: arr(
      obj({
        assumption_id: str("An assumption ID from the thesis."),
        verdict: strEnum(["supported", "weakened", "contradicted", "unresolved"]),
        reasoning: str("Why, weighing the challenges against the evidence. Cite IDs."),
        claim_ids: ids("C", "claims that decided this verdict"),
        challenge_ids: ids("X", "challenges that decided this verdict"),
      }),
      "Exactly one assessment per thesis assumption.",
    ),
    thesis_verdict: strEnum(["strengthened", "survived", "weakened", "overturned"]),
    revised_statement: str("The thesis as it stands after the stress test. May equal the original if it survived intact."),
    changes: arr(
      obj({
        from: str("What the initial thesis said or assumed."),
        to: str("What the evidence now supports instead."),
        reason: str("Why it changed."),
        claim_ids: ids("C", "claims that caused this change"),
        challenge_ids: ids("X", "challenges that caused this change"),
      }),
      "Every material change between the initial and revised thesis. Empty if nothing changed.",
    ),
    unresolved: arr(str(), "Questions the evidence cannot settle either way."),
  }),
);

export const CONCLUSION_SCHEMA = schema(
  "conclusion",
  obj({
    final_statement: str("The best-supported answer to the research question, with its conditions. Two to four sentences."),
    confidence: strEnum(CONFIDENCE),
    confidence_rationale: str("Why this confidence level after the stress test."),
    key_supporting_claim_ids: ids("C", "the claims that most support the conclusion"),
    key_challenging_claim_ids: ids("C", "the claims that most cut against it"),
    uncertainties: arr(str(), "What remains uncertain."),
    next_validation_steps: arr(
      obj({
        step: str("A concrete, cheap action that would reduce the biggest uncertainty (e.g. interview 20 SME owners about willingness to pay)."),
        resolves: str("Which uncertainty it resolves."),
      }),
      "2-4 steps, most valuable first.",
    ),
  }),
);
