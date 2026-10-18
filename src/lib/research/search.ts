import { isCreditStatus, OutOfCredits } from "../credits";

export type SearchResult = {
  url: string;
  title: string;
  content: string;
  score: number;
  published_date: string | null;
};

/** `domains` limits a search to those sites (and their subdomains). */
export type SearchOptions = { domains?: readonly string[] };

export interface SearchProvider {
  readonly mode: "live" | "mock";
  search(query: string, maxResults: number, options?: SearchOptions): Promise<SearchResult[]>;
}

type TavilyResponse = {
  results: { url: string; title: string; content: string; score: number; published_date?: string }[];
};

/** Tavily returns LLM-ready excerpts per result, which is what the claim extractor needs. */
export class TavilySearch implements SearchProvider {
  readonly mode = "live" as const;

  constructor(private apiKey: string) {}

  async search(query: string, maxResults: number, { domains }: SearchOptions = {}): Promise<SearchResult[]> {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({
        query,
        max_results: maxResults,
        search_depth: "advanced",
        topic: "general",
        ...(domains?.length ? { include_domains: domains } : {}),
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      // Tavily answers 432 when the plan's credits are used up and 433 at the pay-as-you-go limit.
      if (res.status === 432 || res.status === 433 || isCreditStatus(res.status, text)) throw new OutOfCredits("Tavily", text);
      throw new Error(`Tavily search failed (${res.status}): ${text}`);
    }
    const data = (await res.json()) as TavilyResponse;
    return data.results.map((r) => ({
      url: r.url,
      title: r.title,
      content: r.content,
      score: r.score,
      published_date: r.published_date ?? null,
    }));
  }
}
