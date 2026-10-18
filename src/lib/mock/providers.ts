import type { ReasoningProvider, ReasonRequest, ReasonResult } from "../reasoning/provider";
import type { SearchProvider, SearchResult } from "../research/search";
import { MOCK_OUTPUTS, MOCK_SEARCH_RESULTS } from "./fixtures";

/** Simulated latency so the streaming UI behaves as it will live. CRUX_MOCK_DELAY_MS=0 in tests. */
const delay = () => {
  const ms = Number(process.env.CRUX_MOCK_DELAY_MS ?? 600);
  return ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve();
};

export class MockReasoning implements ReasoningProvider {
  readonly mode = "mock" as const;

  async reason<T>(req: ReasonRequest): Promise<ReasonResult<T>> {
    await delay();
    const output = MOCK_OUTPUTS[req.step];
    if (!output) throw new Error(`No mock output for step "${req.step}".`);
    return { output: structuredClone(output) as T, model: "mock" };
  }
}

export class MockSearch implements SearchProvider {
  readonly mode = "mock" as const;

  /** Every query returns the same fixture set; the collector dedupes by URL. */
  async search(): Promise<SearchResult[]> {
    return structuredClone(MOCK_SEARCH_RESULTS);
  }
}
