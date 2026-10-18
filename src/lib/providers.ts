import { MockReasoning, MockSearch } from "./mock/providers";
import type { ReasoningProvider } from "./reasoning/provider";
import { ServProvider } from "./reasoning/serv";
import { TavilySearch, type SearchProvider } from "./research/search";

/**
 * Live when keys are present, mock otherwise (or when CRUX_MOCK=1), so the whole
 * pipeline and UI can be developed and demoed offline. Mock runs are labelled as such.
 */
export function getProviders(): { reasoning: ReasoningProvider; search: SearchProvider } {
  const forceMock = process.env.CRUX_MOCK === "1";
  const servKey = process.env.SERV_API_KEY?.trim();
  const tavilyKey = process.env.TAVILY_API_KEY?.trim();
  return {
    reasoning: !forceMock && servKey ? new ServProvider(servKey) : new MockReasoning(),
    search: !forceMock && tavilyKey ? new TavilySearch(tavilyKey) : new MockSearch(),
  };
}
