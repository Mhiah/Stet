import { SOURCE_KIND_LABEL } from "./research/sources";
import type { ResearchProject } from "./types";

/**
 * Audit trail: resolves any record ID (S, C, A, X) to what it is and everything it
 * links to, in both directions: down toward sources (what it rests on) and up toward
 * the conclusion (what relies on it). Pure, so the UI and tests share it.
 */

export type RefKind = "source" | "claim" | "assumption" | "challenge";

export type TraceLink = { label: string; ids: string[] };

export type TraceNode = {
  id: string;
  kind: RefKind;
  title: string;
  body: string;
  meta: string[];
  url?: string;
  /** Records this one rests on (toward the evidence). */
  restsOn: TraceLink[];
  /** Places in the reasoning that rely on this record (toward the conclusion). */
  usedBy: { label: string; text: string; ids: string[] }[];
};

export function refKind(id: string): RefKind | null {
  switch (id[0]) {
    case "S":
      return "source";
    case "C":
      return "claim";
    case "A":
      return "assumption";
    case "X":
      return "challenge";
    default:
      return null;
  }
}

const nonEmpty = (links: TraceLink[]) => links.filter((l) => l.ids.length > 0);

/** Every place in the later stages that cites `id`, with the text that cites it. */
function citations(p: ResearchProject, id: string): TraceNode["usedBy"] {
  const out: TraceNode["usedBy"] = [];
  const t = p.thesis;
  if (t?.supporting_claim_ids.includes(id)) out.push({ label: "Initial thesis", text: t.statement, ids: [] });
  for (const a of t?.assumptions ?? []) {
    if (a.supporting_claim_ids.includes(id)) out.push({ label: `Assumption ${a.id}`, text: a.text, ids: [a.id] });
  }
  for (const c of p.stress_test?.challenges ?? []) {
    if (c.claim_ids.includes(id) || c.target_assumption_ids.includes(id)) {
      out.push({ label: `Challenge ${c.id}`, text: c.text, ids: [c.id] });
    }
  }
  for (const a of p.reevaluation?.assessments ?? []) {
    if (a.claim_ids.includes(id) || a.challenge_ids.includes(id) || a.assumption_id === id) {
      out.push({ label: `Re-evaluation of ${a.assumption_id}: ${a.verdict}`, text: a.reasoning, ids: [a.assumption_id] });
    }
  }
  for (const c of p.reevaluation?.changes ?? []) {
    if (c.claim_ids.includes(id) || c.challenge_ids.includes(id)) {
      out.push({ label: "Changed the thesis", text: `${c.from} → ${c.to}`, ids: [] });
    }
  }
  const concl = p.conclusion;
  if (concl?.key_supporting_claim_ids.includes(id)) out.push({ label: "Conclusion: key support", text: concl.final_statement, ids: [] });
  if (concl?.key_challenging_claim_ids.includes(id)) out.push({ label: "Conclusion: key challenge", text: concl.final_statement, ids: [] });
  return out;
}

export function trace(p: ResearchProject, id: string): TraceNode | null {
  const kind = refKind(id);
  if (!kind) return null;

  if (kind === "source") {
    const s = p.research?.sources.find((x) => x.id === id);
    if (!s) return null;
    const claims = p.research!.claims.filter((c) => c.source_ids.includes(id)).map((c) => c.id);
    return {
      id,
      kind,
      title: s.title,
      body: s.excerpt,
      meta: [s.publisher, s.published_date, s.kind && SOURCE_KIND_LABEL[s.kind], ...(s.flags ?? [])].filter((m): m is string => !!m),
      url: s.url,
      restsOn: [],
      usedBy: claims.length ? [{ label: "Claims drawn from this source", text: "", ids: claims }] : [],
    };
  }

  if (kind === "claim") {
    const c = p.research?.claims.find((x) => x.id === id);
    if (!c) return null;
    return {
      id,
      kind,
      title: c.text,
      body: (c.quotes ?? []).map((q) => `“${q.text}” (${q.source_id})`).join("\n\n"),
      meta: [
        c.category.replace(/_/g, " "),
        c.stance,
        ...(c.unmatched_numbers?.length ? [`figures not in source: ${c.unmatched_numbers.join(", ")}`] : []),
      ],
      restsOn: nonEmpty([{ label: "Sources", ids: c.source_ids }]),
      usedBy: citations(p, id),
    };
  }

  if (kind === "assumption") {
    const a = p.thesis?.assumptions.find((x) => x.id === id);
    if (!a) return null;
    const verdict = p.reevaluation?.assessments.find((x) => x.assumption_id === id)?.verdict;
    return {
      id,
      kind,
      title: a.text,
      body: "",
      meta: verdict ? [`re-evaluated: ${verdict}`] : [],
      restsOn: nonEmpty([{ label: "Supporting claims", ids: a.supporting_claim_ids }]),
      usedBy: citations(p, id),
    };
  }

  const x = p.stress_test?.challenges.find((c) => c.id === id);
  if (!x) return null;
  return {
    id,
    kind,
    title: x.text,
    body: "",
    meta: [x.kind.replace(/_/g, " "), x.severity],
    restsOn: nonEmpty([
      { label: "Grounded in claims", ids: x.claim_ids },
      { label: "Challenges assumptions", ids: x.target_assumption_ids },
    ]),
    usedBy: citations(p, id).filter((u) => !u.label.startsWith(`Challenge ${id}`)),
  };
}
