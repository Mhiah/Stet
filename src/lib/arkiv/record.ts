import { createHash } from "node:crypto";
import type { ResearchProject } from "../types";

/**
 * The exact bytes Stet puts on Arkiv for a run, and how they are hashed.
 *
 * A run's record is its research project with every key sorted, so the same run always
 * serialises to the same bytes. Its SHA-256 is stored as the run entity's `content_sha256`
 * attribute, which is what lets anyone check a copy of a brief against the chain.
 */

export const APP = "stet";
export const RUN_SCHEMA = "stet.run/1";
export const FACT_SCHEMA = "stet.fact/1";
export const CHALLENGE_SCHEMA = "stet.challenge/1";

/** Source excerpts are cut to this length on chain; the full excerpt's hash is kept beside it. */
export const EXCERPT_LIMIT = 1200;
/** Arkiv's payload ceiling is 128 KiB; stay under it with room to spare. */
export const PAYLOAD_LIMIT = 120 * 1024;

export type RunRecord = Omit<ResearchProject, "arkiv"> & {
  schema: typeof RUN_SCHEMA;
  /** The run this one revises, when it is a revision. */
  supersedes: string | null;
  /** The first run in this line of revisions (itself, for an original). */
  lineage: string;
};

/** JSON with object keys sorted at every level, so equal values give equal bytes. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value).sort()) {
      const v = (value as Record<string, unknown>)[k];
      if (v !== undefined) out[k] = sortKeys(v);
    }
    return out;
  }
  return value;
}

export const sha256Hex = (data: string | Uint8Array) => `0x${createHash("sha256").update(data).digest("hex")}` as `0x${string}`;

/** Builds the record stored on chain. Excerpts are trimmed so a run fits in one entity. */
export function toRunRecord(
  project: ResearchProject,
  opts: { supersedes?: string | null; lineage?: string | null } = {},
): RunRecord {
  const { arkiv: _omit, ...rest } = project;
  void _omit;
  const record: RunRecord = {
    ...structuredClone(rest),
    schema: RUN_SCHEMA,
    supersedes: opts.supersedes ?? null,
    lineage: opts.lineage ?? project.id,
  };
  if (record.research) {
    record.research.sources = record.research.sources.map((s) => ({
      ...s,
      excerpt: s.excerpt.length > EXCERPT_LIMIT ? `${s.excerpt.slice(0, EXCERPT_LIMIT)}…` : s.excerpt,
      excerpt_sha256: sha256Hex(s.excerpt),
    }));
  }
  // The audit trail repeats every stage's output; on chain, keep its shape but not the duplicate output.
  record.audit = record.audit.map((a) => ({ ...a, output: { sha256: sha256Hex(canonicalJson(a.output)) } }));
  return record;
}

export function encodeRecord(record: unknown): { bytes: Uint8Array; hash: `0x${string}` } {
  const text = canonicalJson(record);
  const bytes = new TextEncoder().encode(text);
  if (bytes.length > PAYLOAD_LIMIT) {
    throw new Error(`Run record is ${bytes.length} bytes, over the ${PAYLOAD_LIMIT}-byte limit for one Arkiv entity.`);
  }
  return { bytes, hash: sha256Hex(bytes) };
}

/** One entity per fact, so facts can be queried across runs (e.g. every challenging fact). */
export function toFactRecords(record: RunRecord) {
  const sources = record.research?.sources ?? [];
  return (record.research?.claims ?? []).map((c) => ({
    schema: FACT_SCHEMA,
    run_id: record.id,
    claim_id: c.id,
    text: c.text,
    stance: c.stance,
    category: c.category,
    quotes: c.quotes,
    unmatched_numbers: c.unmatched_numbers,
    sources: c.source_ids.map((id) => {
      const s = sources.find((x) => x.id === id);
      return s ? { id, url: s.url, title: s.title, publisher: s.publisher, excerpt_sha256: (s as { excerpt_sha256?: string }).excerpt_sha256 ?? null } : { id };
    }),
  }));
}

/**
 * Lists the paths where a candidate copy differs from the record on chain, so a tamper check
 * can say what was changed, not just that something was.
 */
export function diffPaths(a: unknown, b: unknown, path = "", out: string[] = [], max = 25): string[] {
  if (out.length >= max) return out;
  if (Object.is(a, b)) return out;
  const isObj = (v: unknown) => v !== null && typeof v === "object";
  if (!isObj(a) || !isObj(b) || Array.isArray(a) !== Array.isArray(b)) {
    out.push(path || "(root)");
    return out;
  }
  const keys = new Set([...Object.keys(a as object), ...Object.keys(b as object)]);
  for (const k of [...keys].sort()) {
    diffPaths((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], path ? `${path}.${k}` : k, out, max);
    if (out.length >= max) break;
  }
  return out;
}
