import type { Research, ResearchProject } from "./types";

/**
 * SERV cites record IDs inside its prose ("…well evidenced (C1, C2), so X4 weakens it").
 * The report's reading views show plain sentences instead, and turn the IDs into a single
 * "Evidence" link; the IDs themselves stay in the data and the audit trail.
 */

const ID = "[SCAX]\\d{1,3}";
// IDs listed ("C1, C2 and C3") or as a range ("C1-C3", "C1 to C3"; en dashes are already hyphens here).
const LIST = `${ID}(?:\\s*(?:,|;|and|&|/|or|-|to|through)\\s*${ID})*`;
const NOUN: Record<string, string> = { C: "the evidence", S: "the sources", A: "an assumption", X: "the stress test" };

export function refsIn(text: string): string[] {
  return [...new Set(text.match(new RegExp(`\\b${ID}\\b`, "g")) ?? [])];
}

/**
 * No em dashes in what we show: a dash used as punctuation becomes a comma, and a dash inside
 * a range or compound ("3–4", "15 – 20", "UK–Nigeria") becomes a plain hyphen.
 */
export function stripDashes(text: string): string {
  return text
    .replace(/(\d)\s+[–—-]\s+(\d)/g, "$1-$2")
    .replace(/(\S)–(\S)/g, "$1-$2")
    .replace(/\s*[—―]\s*|\s+[–-]\s+/g, ", ")
    .replace(/,\s*([,.;:!?)])/g, "$1")
    .replace(/^[,\s]+/, "");
}

/** Every record ID in a project: only these are treated as citations when cleaning text. */
export function recordIds(p: ResearchProject): Set<string> {
  return new Set([
    ...(p.research?.sources ?? []).map((s) => s.id),
    ...(p.research?.claims ?? []).map((c) => c.id),
    ...(p.thesis?.assumptions ?? []).map((a) => a.id),
    ...(p.stress_test?.challenges ?? []).map((x) => x.id),
  ]);
}

const startsSentence = (before: string) => /(^|[.!?]\s+)$/.test(before) && !/\b(?:e\.g|i\.e|vs|approx|etc|U\.S)\.\s+$/i.test(before);
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Removes record IDs from prose. Only IDs in `known` count as citations, so "Series A1" or
 * "AWS S3" in a sentence are left alone.
 */
export function stripRefs(text: string, known: ReadonlySet<string>): string {
  const cited = (list: string) => (list.match(new RegExp(ID, "g")) ?? []).every((id) => known.has(id));
  return (
    stripDashes(text)
      // "(C1, C2 and C11)", "[X3]", "(see C4)"
      .replace(new RegExp(`\\s*[([]\\s*(?:see|e\\.g\\.,?|per|via|cf\\.)?\\s*(${LIST})\\s*[)\\]]`, "gi"), (m, list: string) => (cited(list) ? "" : m))
      // "Assumption A2 fails" → "This assumption fails"; "claims C3 and C4" → "these claims"
      .replace(new RegExp(`\\b(claim|challenge|assumption|source)(s?)\\s+(${LIST})\\b`, "gi"), (m, noun: string, plural: string, list: string, at: number, all: string) => {
        if (!cited(list)) return m;
        const phrase = `${plural ? "these" : "this"} ${noun.toLowerCase()}${plural}`;
        return startsSentence(all.slice(0, at)) ? capitalize(phrase) : phrase;
      })
      // Anything left is an ID used as a word: "so X4 weakens urgency".
      .replace(new RegExp(`\\b${LIST}\\b`, "g"), (m: string, at: number, all: string) => {
        if (!cited(m)) return m;
        return startsSentence(all.slice(0, at)) ? capitalize(NOUN[m[0]]) : NOUN[m[0]];
      })
      .replace(/\s+([,.;:!?)])/g, "$1")
      .replace(/\(\s*\)/g, "")
      .replace(/\s{2,}/g, " ")
      .trim()
  );
}

/** The fact-check outcome in one or two sentences, so the numbers always add up. */
export function factCheckSummary({ extracted, dropped, merged = 0, flagged }: Research["fact_check"]): string {
  const parts = [
    dropped > 0 ? `${dropped} of ${extracted} extracted facts were dropped because their quotes weren't in the source` : `All ${extracted} extracted facts passed`,
    merged > 0 && `${merged} ${merged === 1 ? "was a duplicate" : "were duplicates"} merged into another fact`,
  ].filter(Boolean);
  const flaggedNote = flagged > 0 ? ` ${flagged} ${flagged === 1 ? "is" : "are"} flagged for figures their quote doesn't contain.` : "";
  return `${parts.join(", and ")}.${flaggedNote}`;
}

/**
 * The claims behind any mix of record IDs: claims themselves, the claims a challenge rests
 * on, an assumption's support and its re-evaluation, and the claims drawn from a source.
 */
export function claimsBehind(project: ResearchProject, ids: string[]): string[] {
  const out = new Set<string>();
  const claims = project.research?.claims ?? [];
  const add = (list: string[] = []) => list.forEach((id) => out.add(id));
  for (const id of ids) {
    if (id[0] === "C") out.add(id);
    if (id[0] === "X") add(project.stress_test?.challenges.find((x) => x.id === id)?.claim_ids);
    if (id[0] === "A") {
      add(project.thesis?.assumptions.find((a) => a.id === id)?.supporting_claim_ids);
      add(project.reevaluation?.assessments.find((a) => a.assumption_id === id)?.claim_ids);
    }
    if (id[0] === "S") add(claims.filter((c) => c.source_ids.includes(id)).map((c) => c.id));
  }
  const known = new Set(claims.map((c) => c.id));
  return [...out].filter((id) => known.has(id)).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
}
