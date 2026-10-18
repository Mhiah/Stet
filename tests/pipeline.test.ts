/* eslint-disable @typescript-eslint/no-explicit-any -- overrides patch loosely-typed fixture output */
import { describe, expect, it } from "vitest";
import { MockReasoning, MockSearch } from "../src/lib/mock/providers";
import { MOCK_CLAIMS } from "../src/lib/mock/fixtures";
import { isCreditStatus, OutOfCredits } from "../src/lib/credits";
import { runResearch } from "../src/lib/pipeline";
import type { ReasoningProvider, ReasonRequest } from "../src/lib/reasoning/provider";
import type { PipelineEvent } from "../src/lib/types";

process.env.CRUX_MOCK_DELAY_MS = "0";
const QUESTION = "Should we launch an AI bookkeeping SaaS for Nigerian SMEs?";

/** Mock reasoning with per-step overrides. */
function reasoningWith(overrides: Record<string, (base: any) => unknown>): ReasoningProvider {
  const base = new MockReasoning();
  return {
    mode: "mock",
    async reason<T>(req: ReasonRequest) {
      const res = await base.reason<any>(req);
      const override = overrides[req.step];
      return { ...res, output: (override ? override(res.output) : res.output) as T };
    },
  };
}

describe("runResearch", () => {
  it("runs every stage in order and assembles What Changed", async () => {
    const events: PipelineEvent[] = [];
    const project = await runResearch(QUESTION, {
      reasoning: new MockReasoning(),
      search: new MockSearch(),
      onEvent: (e) => events.push(e),
    });

    expect(project.status).toBe("complete");
    expect(project.mode).toBe("mock");
    expect(events.filter((e) => e.type === "stage_completed").map((e) => (e as { stage: string }).stage)).toEqual([
      "research",
      "thesis",
      "stress_test",
      "reevaluation",
      "conclusion",
      "what_changed",
    ]);
    expect(events.at(-1)?.type).toBe("done");

    expect(project.research!.sources.map((s) => s.id)).toEqual(["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8"]);
    expect(project.research!.claims).toHaveLength(MOCK_CLAIMS.claims.length);
    expect(project.thesis!.assumptions.map((a) => a.id)).toEqual(["A1", "A2", "A3", "A4"]);
    expect(project.stress_test!.challenges[0].id).toBe("X1");

    const wc = project.what_changed!;
    expect(wc.initial.statement).toBe(project.thesis!.statement);
    expect(wc.final.statement).toBe(project.conclusion!.final_statement);
    expect(wc.verdict).toBe("weakened");
    expect(wc.challenged[0].severity).toBe("critical");
    expect(wc.assumptions.find((a) => a.assumption_id === "A2")?.verdict).toBe("weakened");

    expect(project.audit.map((a) => a.stage)).toHaveLength(6);
    expect(project.audit.every((a) => a.warnings.length === 0)).toBe(true);
  });

  it("strips citations to IDs that don't exist and records a warning", async () => {
    const project = await runResearch(QUESTION, {
      reasoning: reasoningWith({
        thesis: (t) => ({ ...t, supporting_claim_ids: [...t.supporting_claim_ids, "C999"] }),
        claims: (c) => ({
          claims: [...c.claims, { text: "Invented", quotes: [{ source_id: "S42", text: "a quote from a source that does not exist" }], category: "other", stance: "neutral" }],
        }),
      }),
      search: new MockSearch(),
    });

    expect(project.status).toBe("complete");
    expect(project.thesis!.supporting_claim_ids).not.toContain("C999");
    expect(project.research!.claims.some((c) => c.text === "Invented")).toBe(false);
    const warnings = project.audit.flatMap((a) => a.warnings);
    expect(warnings.some((w) => w.includes("C999"))).toBe(true);
    expect(warnings.some((w) => w.includes("unknown source S42"))).toBe(true);
    expect(warnings.some((w) => w.includes('Dropped claim "Invented'))).toBe(true);
  });

  it("fact-checks claims: keeps verified quotes, drops invented ones, flags unquoted figures", async () => {
    const project = await runResearch(QUESTION, {
      reasoning: reasoningWith({
        claims: () => ({
          claims: [
            // Real quote from S1, plus a paraphrase passed off as a quote from S2: S2 is removed.
            {
              text: "Most small businesses still keep paper records.",
              quotes: [
                { source_id: "S1", text: "68% said they still keep records in paper ledgers or notebooks" },
                { source_id: "S2", text: "most businesses keep paper records" },
              ],
              category: "market_demand",
              stance: "supports",
            },
            // Fabricated quote: dropped entirely.
            { text: "90% of SMEs want AI bookkeeping.", quotes: [{ source_id: "S1", text: "90% of SMEs said they want AI bookkeeping" }], category: "customers", stance: "supports" },
            // Quote is real but the claim inflates the figure: kept and flagged.
            { text: "80% of owners use a smartphone for business daily.", quotes: [{ source_id: "S1", text: "71% of owners use a smartphone for business daily" }], category: "adoption", stance: "supports" },
            // An ellipsis skipping words and different case still verify.
            { text: "Lenders reject loans over missing records.", quotes: [{ source_id: "S5", text: "LENDERS cite missing financial records … for rejecting small business loan applications" }], category: "customers", stance: "supports" },
          ],
        }),
      }),
      search: new MockSearch(),
    });

    expect(project.status).toBe("complete");
    const claims = project.research!.claims;
    expect(claims.map((c) => c.id)).toEqual(["C1", "C2", "C3"]);
    expect(claims[0].source_ids).toEqual(["S1"]);
    expect(claims.some((c) => c.text.startsWith("90%"))).toBe(false);
    expect(claims[1].unmatched_numbers).toEqual(["80"]);
    expect(claims[2].source_ids).toEqual(["S5"]);
    expect(project.research!.fact_check).toEqual({ extracted: 4, dropped: 1, merged: 0, flagged: 1 });

    const warnings = project.audit[0].warnings;
    expect(warnings.some((w) => w.includes("isn't in S2's text"))).toBe(true);
    expect(warnings.some((w) => w.includes('Dropped claim "90%'))).toBe(true);
    expect(warnings.some((w) => w.includes("C2: figures 80"))).toBe(true);
  });

  it("marks assumptions the re-evaluation skipped as unresolved", async () => {
    const project = await runResearch(QUESTION, {
      reasoning: reasoningWith({ reevaluation: (r) => ({ ...r, assessments: r.assessments.slice(0, 2) }) }),
      search: new MockSearch(),
    });

    const assessments = project.reevaluation!.assessments;
    expect(assessments.map((a) => a.assumption_id)).toEqual(["A1", "A2", "A3", "A4"]);
    expect(assessments[2].verdict).toBe("unresolved");
  });

  it("fails the project with the failing stage when a step throws", async () => {
    const events: PipelineEvent[] = [];
    let saved = false;
    const project = await runResearch(QUESTION, {
      reasoning: reasoningWith({
        stress_test: () => {
          throw new Error("SERV unavailable");
        },
      }),
      search: new MockSearch(),
      onEvent: (e) => events.push(e),
      save: async () => {
        saved = true;
      },
    });

    expect(project.status).toBe("failed");
    expect(project.error).toBe("SERV unavailable");
    expect(project.thesis).not.toBeNull();
    expect(events).toContainEqual({ type: "error", stage: "stress_test", message: "SERV unavailable" });
    expect(saved).toBe(true);
    expect(events.at(-1)).toMatchObject({ type: "done", saved: true });
  });

  it("still delivers the report when it can't be saved, and says it wasn't saved", async () => {
    const events: PipelineEvent[] = [];
    const project = await runResearch(QUESTION, {
      reasoning: new MockReasoning(),
      search: new MockSearch(),
      onEvent: (e) => events.push(e),
      save: async () => {
        throw new Error("EROFS: read-only file system");
      },
    });
    expect(project.status).toBe("complete");
    expect(events.at(-1)).toMatchObject({ type: "done", saved: false, project: { status: "complete" } });

    const unsaved: PipelineEvent[] = [];
    await runResearch(QUESTION, { reasoning: new MockReasoning(), search: new MockSearch(), onEvent: (e) => unsaved.push(e) });
    expect(unsaved.at(-1)).toMatchObject({ type: "done", saved: false });
  });
});

describe("running out of credits", () => {
  const liveReasoning = (fail: string) => {
    const mock = new MockReasoning();
    return {
      mode: "live" as const,
      async reason<T>(req: ReasonRequest) {
        if (req.step === fail) throw new OutOfCredits("SERV", "402 Insufficient credits");
        return mock.reason<T>(req);
      },
    };
  };
  const liveSearch = { mode: "live" as const, search: () => new MockSearch().search() };

  it("reruns the question on sample data, says why, and drops the live attempt", async () => {
    const events: PipelineEvent[] = [];
    const project = await runResearch(QUESTION, {
      reasoning: liveReasoning("stress_test"),
      search: liveSearch,
      onEvent: (e) => events.push(e),
      fallback: { reasoning: new MockReasoning(), search: new MockSearch() },
    });
    expect(project.status).toBe("complete");
    expect(project.mode).toBe("mock");
    expect(project.notice).toMatch(/SERV credits have run out/);
    const types = events.map((e) => e.type);
    expect(types.filter((t) => t === "project")).toHaveLength(2);
    expect(types).toContain("fallback");
    expect(types).not.toContain("error");
    expect(events.at(-1)).toMatchObject({ type: "done", project: { mode: "mock" } });
  });

  it("treats a Tavily credit error as out of credits, not as a failed search", async () => {
    const search = { mode: "live" as const, search: async () => Promise.reject(new OutOfCredits("Tavily", "432 plan limit")) };
    const project = await runResearch(QUESTION, {
      reasoning: liveReasoning("none"),
      search,
      fallback: { reasoning: new MockReasoning(), search: new MockSearch() },
    });
    expect(project.mode).toBe("mock");
    expect(project.notice).toMatch(/^Tavily credits have run out/);
  });

  it("fails as before when there's no fallback", async () => {
    const project = await runResearch(QUESTION, { reasoning: liveReasoning("thesis"), search: liveSearch });
    expect(project.status).toBe("failed");
    expect(project.error).toMatch(/SERV credits have run out/);
  });

  it("recognises credit errors by status and wording", () => {
    expect(isCreditStatus(402, "")).toBe(true);
    expect(isCreditStatus(429, "Insufficient credits on your account")).toBe(true);
    expect(isCreditStatus(429, "Rate limit reached, slow down")).toBe(false);
    expect(isCreditStatus(401, "Invalid API key")).toBe(false);
  });
});
