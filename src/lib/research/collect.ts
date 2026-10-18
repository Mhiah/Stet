import type { ReasoningProvider } from "../reasoning/provider";
import { CLAIMS_SCHEMA, QUERY_PLAN_SCHEMA } from "../reasoning/schemas";
import { QUERY_PLAN_SYSTEM, CLAIMS_SYSTEM, formatSources } from "../reasoning/prompts";
import type { Claim, Research, Source } from "../types";
import type { SearchProvider } from "./search";
import { classifySource, knownKind, PRIMARY_DOMAINS, sourceFlags, sourceRank, SERV_SOURCE_KINDS, type SourceKind } from "./sources";
import { quoteFound, unmatchedNumbers } from "./verify";
import { OutOfCredits } from "../credits";

const RESULTS_PER_QUERY = 5;
const MAX_SOURCES = 20;
// Tavily's advanced depth returns ~3 relevant chunks per result (typically 1.2k-2.4k chars);
// cutting shorter drops the figures that live past the page intro.
const MAX_EXCERPT_CHARS = 2500;
// The first searches (both sides, since the plan alternates) run a second time limited to
// research, official and industry-report sites, so original data isn't outranked by blogs.
const PRIMARY_PASS_QUERIES = 4;

export type CollectResult = { research: Research; models: string[]; warnings: string[] };

type RawClaim = Pick<Claim, "text" | "category" | "stance" | "quotes">;
/**
 * Models sometimes wrap a claim in quotation marks, or open a quote inside it and never close
 * it ('The source says that "34% of ...'). The claim is a plain statement; the source's own
 * words live in its quotes, so stray quotation marks are removed.
 */
export function cleanClaimText(text: string): string {
  let t = text.trim().replace(/^["“”]+|["“”]+$/g, "").trim();
  const straight = (t.match(/"/g) ?? []).length;
  const curlyOpen = (t.match(/“/g) ?? []).length, curlyClose = (t.match(/”/g) ?? []).length;
  if (straight % 2 === 1 || curlyOpen !== curlyClose) t = t.replace(/["“”]/g, "");
  return t.replace(/\s{2,}/g, " ").trim();
}

type QueryPlan = { supporting_queries?: string[]; challenging_queries?: string[]; queries?: string[] };

/**
 * Supporting and challenging queries alternate, so evidence against the obvious answer is
 * searched for as early and as often as evidence for it.
 */
function interleave(plan: QueryPlan): string[] {
  const pro = plan.supporting_queries ?? plan.queries ?? [];
  const con = plan.challenging_queries ?? [];
  const out: string[] = [];
  for (let i = 0; i < Math.max(pro.length, con.length); i++) {
    if (con[i]) out.push(con[i]);
    if (pro[i]) out.push(pro[i]);
  }
  return [...new Set(out.map((q) => q.trim()).filter(Boolean))].slice(0, 8);
}

/**
 * Picks sources query by query in turn (each query's best result, then each one's second
 * best, ...), so no query's results, least of all the challenging ones, get crowded out by
 * another's higher relevance scores. Within a query, research, official and industry sources
 * come first, then news, then company sites and blogs. Weak sources only fill slots the rest
 * leave open.
 */
function pickSources(perQuery: Omit<Source, "id">[][], max: number): Omit<Source, "id">[] {
  const picked: Omit<Source, "id">[] = [];
  const seen = new Set<string>();
  for (const weak of [false, true]) {
    const lists = perQuery.map((list) => list.filter((s) => s.flags.length > 0 === weak).sort((a, b) => sourceRank(a.kind) - sourceRank(b.kind) || b.relevance - a.relevance));
    for (let round = 0; picked.length < max && lists.some((l) => l.length > round); round++) {
      for (const list of lists) {
        const s = list[round];
        if (s && !seen.has(s.url) && picked.length < max) {
          seen.add(s.url);
          picked.push(s);
        }
      }
    }
  }
  return picked;
}

function publisherOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** Plan queries with SERV, run them, dedupe sources, then extract claims tied to source IDs. */
export async function collectResearch(
  question: string,
  reasoning: ReasoningProvider,
  search: SearchProvider,
): Promise<CollectResult> {
  const warnings: string[] = [];
  const models: string[] = [];

  const plan = await reasoning.reason<QueryPlan>({
    step: "query_plan",
    system: QUERY_PLAN_SYSTEM,
    user: `Research question: ${question}`,
    schema: QUERY_PLAN_SCHEMA,
  });
  models.push(plan.model);
  const queries = interleave(plan.output);
  if (!plan.output.challenging_queries?.length) warnings.push("The search plan had no queries aimed at evidence against the answer.");

  const searches = [
    ...queries.map((q) => ({ query: q, domains: undefined })),
    ...queries.slice(0, PRIMARY_PASS_QUERIES).map((q) => ({ query: q, domains: PRIMARY_DOMAINS })),
  ];
  const settled = await Promise.allSettled(searches.map((s) => search.search(s.query, RESULTS_PER_QUERY, { domains: s.domains })));
  const noCredits = settled.find((r) => r.status === "rejected" && r.reason instanceof OutOfCredits);
  if (noCredits) throw (noCredits as PromiseRejectedResult).reason;
  const perQuery: Omit<Source, "id">[][] = settled.map((r, i) => {
    if (r.status === "rejected") {
      const where = searches[i].domains ? " (research and official sites)" : "";
      warnings.push(`Search failed for "${searches[i].query}"${where}: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`);
      return [];
    }
    // Only web links: a result's URL becomes a clickable link in the report.
    return r.value.filter((hit) => /^https?:\/\//i.test(hit.url)).map((hit) => {
      const kind = classifySource(hit.url);
      return {
        url: hit.url,
        title: hit.title,
        publisher: publisherOf(hit.url),
        published_date: hit.published_date,
        excerpt: hit.content.slice(0, MAX_EXCERPT_CHARS),
        relevance: hit.score,
        kind,
        flags: sourceFlags(kind, hit.published_date),
      };
    });
  });
  if (perQuery.every((l) => l.length === 0)) throw new Error("Research found no sources. Check the search provider and try a different question.");

  const sources: Source[] = pickSources(perQuery, MAX_SOURCES).map((s, i) => ({ id: `S${i + 1}`, ...s }));
  const byId = new Map(sources.map((s) => [s.id, s]));

  const extracted = await reasoning.reason<{ claims: RawClaim[]; sources?: { source_id: string; kind: string }[] }>({
    step: "claims",
    system: CLAIMS_SYSTEM,
    user: `Research question: ${question}\n\nSources:\n${formatSources(sources)}`,
    schema: CLAIMS_SCHEMA,
  });
  models.push(extracted.model);

  // Sites the address list doesn't recognise take SERV's label, which knows the publisher.
  const valid = new Set<string>(SERV_SOURCE_KINDS);
  for (const label of extracted.output.sources ?? []) {
    const source = byId.get(label.source_id);
    if (!source || knownKind(source.url) || !valid.has(label.kind)) continue;
    source.kind = label.kind as SourceKind;
    source.flags = sourceFlags(source.kind, source.published_date);
  }

  const claims: Claim[] = [];
  let dropped = 0;
  let merged = 0;
  for (const raw of extracted.output.claims) {
    const c = { ...raw, text: cleanClaimText(raw.text) };
    const label = `"${c.text.slice(0, 60)}…"`;
    const quotes: Claim["quotes"] = [];
    for (const q of c.quotes ?? []) {
      const source = byId.get(q.source_id);
      if (!source) warnings.push(`Claim ${label} quoted unknown source ${q.source_id}; removed it.`);
      else if (!quoteFound(q.text, source.excerpt)) warnings.push(`Claim ${label}: its quote isn't in ${q.source_id}'s text; removed that source. Quote: "${q.text.slice(0, 200)}"`);
      else if (!quotes.some((v) => v.source_id === q.source_id && v.text === q.text)) quotes.push({ source_id: q.source_id, text: q.text });
    }
    if (quotes.length === 0) {
      dropped++;
      warnings.push(`Dropped claim ${label}: no quote for it was found in any source.`);
      continue;
    }
    // The same claim extracted twice becomes one claim with the quotes of both.
    const same = claims.find((x) => x.text.toLowerCase() === c.text.toLowerCase());
    if (same) {
      merged++;
      for (const q of quotes) if (!same.quotes.some((v) => v.source_id === q.source_id && v.text === q.text)) same.quotes.push(q);
      same.source_ids = [...new Set(same.quotes.map((q) => q.source_id))];
      same.unmatched_numbers = unmatchedNumbers(same.text, same.quotes.map((q) => q.text));
      continue;
    }
    const id = `C${claims.length + 1}`;
    const unmatched = unmatchedNumbers(c.text, quotes.map((q) => q.text));
    if (unmatched.length) warnings.push(`${id}: figures ${unmatched.join(", ")} aren't in its quoted source text; flagged.`);
    claims.push({
      id,
      text: c.text,
      source_ids: [...new Set(quotes.map((q) => q.source_id))],
      category: c.category,
      stance: c.stance,
      quotes,
      unmatched_numbers: unmatched,
    });
  }
  if (claims.length === 0) throw new Error("No claims could be verified against the sources.");

  if (!claims.some((c) => c.stance === "challenges")) {
    warnings.push("No evidence against a 'yes' answer survived extraction; the stress test has only reasoning to go on.");
  }

  const fact_check = { extracted: extracted.output.claims.length, dropped, merged, flagged: claims.filter((c) => c.unmatched_numbers.length).length };
  return { research: { queries, sources, claims, fact_check }, models, warnings };
}
