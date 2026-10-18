import type { Hex } from "viem";
import type { ArkivRef, ResearchProject, RunChallenge } from "../types";
import { EXPLORER, type ArkivBackend, type StoredEntity, type TypedAttr } from "./backend";
import {
  APP,
  CHALLENGE_SCHEMA,
  canonicalJson,
  diffPaths,
  encodeRecord,
  sha256Hex,
  toFactRecords,
  toRunRecord,
  type RunRecord,
} from "./record";

/**
 * Runs, facts and challenges on Arkiv.
 *
 * A run is one read-only entity holding the whole brief; each fact is its own read-only entity
 * pointing back at the run, so facts can be queried across runs. Revisions never edit a run:
 * they are new runs that name the run they supersede and share its lineage. Challenges are
 * entities anyone can write from their own wallet, found by run id rather than by owner.
 */

const DAYS = Number(process.env.ARKIV_TTL_DAYS || 365);
/** A string attribute, cut to Arkiv's 128-byte limit by bytes (not characters) so UTF-8 can't overflow it. */
const s = (v: string): TypedAttr => {
  const bytes = new TextEncoder().encode(v);
  if (bytes.length <= 128) return { t: "str", v };
  return { t: "str", v: new TextDecoder().decode(bytes.slice(0, 128)).replace(/\uFFFD+$/, "") };
};

const decode = (e: StoredEntity) => JSON.parse(new TextDecoder().decode(e.payload));
const str = (v: unknown) => (typeof v === "string" ? v : null);

export async function saveRun(
  backend: ArkivBackend,
  project: ResearchProject,
  opts: { supersedes?: string | null } = {},
): Promise<ArkivRef> {
  let lineage = project.id;
  if (opts.supersedes) {
    const prev = await findRunEntity(backend, opts.supersedes);
    if (!prev) throw new Error(`Run ${opts.supersedes} isn't on Arkiv, so it can't be revised.`);
    lineage = str(prev.attributes.lineage) ?? opts.supersedes;
  }
  const record = toRunRecord(project, { supersedes: opts.supersedes ?? null, lineage });
  const { bytes, hash } = encodeRecord(record);

  const run = await backend.create([
    {
      payload: bytes,
      contentType: "application/json",
      days: DAYS,
      attributes: {
        app: s(APP),
        kind: s("run"),
        schema: s(record.schema),
        run_id: s(project.id),
        lineage: s(lineage),
        ...(opts.supersedes ? { supersedes: s(opts.supersedes) } : {}),
        content_sha256: { t: "bytes32", v: hash },
        status: s(project.status),
        mode: s(project.mode),
        confidence: s(project.conclusion?.confidence ?? "none"),
        verdict: s(project.reevaluation?.thesis_verdict ?? "none"),
        fact_count: { t: "i32", v: project.research?.claims.length ?? 0 },
        created_ms: { t: "u64", v: BigInt(Date.parse(project.created_at)) },
      },
    },
  ]);
  const runKey = run.keys[0];

  const facts = toFactRecords(record);
  if (facts.length) {
    await backend.create(
      facts.map((f) => ({
        payload: encodeRecord(f).bytes,
        contentType: "application/json",
        days: DAYS,
        attributes: {
          app: s(APP),
          kind: s("fact"),
          run_id: s(project.id),
          run: { t: "key", v: runKey },
          claim_id: s(f.claim_id),
          stance: s(f.stance),
          category: s(f.category),
          quote_checked: { t: "bool", v: f.unmatched_numbers.length === 0 },
        },
      })),
    );
  }

  return {
    key: runKey,
    owner: backend.writer,
    tx: run.txHash,
    content_sha256: hash,
    intact: true,
    readonly: true,
    supersedes: opts.supersedes ?? null,
    lineage,
    expires_at_block: null,
    explorer_url: `${EXPLORER}/entity/${runKey}`,
  };
}

/** The wallet that publishes Stet's briefs on Tiramisu. Override with STET_WRITER_ADDRESS. */
export const STET_WRITER = "0x441aB97848BB539187D93EF3eF7125D1FbABbf27" as Hex;

/**
 * The address whose runs count as Stet's: STET_WRITER_ADDRESS if set, else this deployment's own
 * writer, else Stet's publisher. Checked against $creator, which never changes, not the
 * transferable owner.
 */
export function trustedWriter(backend: ArkivBackend): Hex {
  return ((process.env.STET_WRITER_ADDRESS?.trim() || null) as Hex | null) ?? backend.writer ?? STET_WRITER;
}

async function findRunEntity(backend: ArkivBackend, runId: string) {
  // Filtered by $creator in the query itself: a run with the same id written by anyone else is never returned.
  const found = await backend.find({ app: APP, kind: "run", run_id: runId }, 10, { creator: trustedWriter(backend) });
  return found[0] ?? null;
}

function refFor(e: StoredEntity, record: RunRecord): ArkivRef {
  const recorded = String(e.attributes.content_sha256 ?? "").toLowerCase();
  return {
    key: e.key,
    owner: e.creator ?? e.owner,
    tx: null,
    content_sha256: recorded as Hex,
    intact: sha256Hex(e.payload).toLowerCase() === recorded,
    readonly: e.readonly,
    supersedes: record.supersedes,
    lineage: record.lineage,
    expires_at_block: e.expiresAt?.toString() ?? null,
    explorer_url: `${EXPLORER}/entity/${e.key}`,
  };
}

/** Rebuilds a run from its chain record. Trimmed excerpts and audit hashes are what was stored. */
function toProject(e: StoredEntity): ResearchProject {
  const record = decode(e) as RunRecord;
  const { schema: _schema, supersedes: _sup, lineage: _lin, ...project } = record;
  void _schema;
  void _sup;
  void _lin;
  return { ...(project as ResearchProject), arkiv: refFor(e, record) };
}

export async function loadRun(backend: ArkivBackend, runId: string): Promise<ResearchProject | null> {
  const e = await findRunEntity(backend, runId);
  return e ? toProject(e) : null;
}

/** The exact stored record text, for downloading a copy that can be checked later. */
export async function loadRecordText(backend: ArkivBackend, runId: string): Promise<string | null> {
  const e = await findRunEntity(backend, runId);
  return e ? new TextDecoder().decode(e.payload) : null;
}

export async function loadRunByKey(backend: ArkivBackend, key: Hex): Promise<ResearchProject | null> {
  const e = await backend.get(key);
  if (!e || e.attributes.kind !== "run") return null;
  const writer = trustedWriter(backend);
  if (e.creator?.toLowerCase() !== writer.toLowerCase()) return null;
  return toProject(e);
}

export type RunSummary = {
  run_id: string;
  key: Hex;
  question: string;
  created_at: string;
  confidence: string;
  verdict: string;
  supersedes: string | null;
  lineage: string;
};

/** Recent runs, newest first. Optionally one line of revisions. */
export async function listRuns(backend: ArkivBackend, opts: { lineage?: string; limit?: number } = {}): Promise<RunSummary[]> {
  const where: Record<string, string> = { app: APP, kind: "run" };
  if (opts.lineage) where.lineage = opts.lineage;
  const found = await backend.find(where, 200, { creator: trustedWriter(backend) });
  return found
    .map((e) => {
      const r = decode(e) as RunRecord;
      return {
        run_id: r.id,
        key: e.key,
        question: r.question,
        created_at: r.created_at,
        confidence: String(e.attributes.confidence ?? ""),
        verdict: String(e.attributes.verdict ?? ""),
        supersedes: r.supersedes,
        lineage: r.lineage,
      };
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, opts.limit ?? 50);
}

export type VerifyResult =
  | { found: false }
  | {
      found: true;
      key: Hex;
      owner: Hex | null;
      readonly: boolean;
      recorded_sha256: string;
      /** The stored payload still hashes to the recorded value. */
      chain_intact: boolean;
      /** Present when a copy was given: whether it matches the chain record exactly. */
      copy?: { sha256: string; matches: boolean; changed: string[] };
    };

/**
 * Checks a run on Arkiv, and optionally a copy of it (a downloaded record someone might have edited)
 * against what the chain holds.
 */
export async function verifyRun(
  backend: ArkivBackend,
  ref: { runId?: string; key?: Hex },
  copy?: unknown,
): Promise<VerifyResult> {
  const e = ref.key ? await backend.get(ref.key) : ref.runId ? await findRunEntity(backend, ref.runId) : null;
  if (!e || e.attributes.kind !== "run") return { found: false };
  const writer = trustedWriter(backend);
  if (e.creator?.toLowerCase() !== writer.toLowerCase()) return { found: false };
  const recorded = String(e.attributes.content_sha256 ?? "").toLowerCase();
  const result: VerifyResult = {
    found: true,
    key: e.key,
    owner: e.creator ?? e.owner,
    readonly: e.readonly,
    recorded_sha256: recorded,
    chain_intact: sha256Hex(e.payload).toLowerCase() === recorded,
  };
  if (copy !== undefined) {
    const copyHash = sha256Hex(canonicalJson(copy)).toLowerCase();
    result.copy = {
      sha256: copyHash,
      matches: copyHash === recorded,
      changed: copyHash === recorded ? [] : diffPaths(decode(e), copy),
    };
  }
  return result;
}

/** Counter-claims on a run from any wallet. Stet lists them all; it has no way to delete them. */
export async function listChallenges(backend: ArkivBackend, runId: string, runCreator: Hex | null): Promise<RunChallenge[]> {
  const found = await backend.find({ app: APP, kind: "challenge", run_id: runId }, 200);
  return found
    .map((e) => {
      let body: { text?: unknown; evidence_url?: unknown; target?: unknown } = {};
      try {
        body = decode(e);
      } catch {
        /* a malformed challenge still shows, with its attributes */
      }
      return {
        key: e.key,
        owner: e.creator ?? e.owner,
        run_id: runId,
        target: str(body.target) ?? String(e.attributes.target ?? "brief"),
        text: (str(body.text) ?? "").slice(0, 2000),
        evidence_url: str(body.evidence_url),
        independent: !runCreator || (e.creator ?? e.owner)?.toLowerCase() !== runCreator.toLowerCase(),
      };
    })
    .filter((c) => c.text);
}

/** Builds a challenge entity. Signed by whoever holds the backend's key: the challenger, not Stet. */
export async function postChallenge(
  backend: ArkivBackend,
  c: { runId: string; target: string; text: string; evidenceUrl?: string | null },
) {
  const text = c.text.trim();
  if (text.length < 10 || text.length > 2000) throw new Error("A challenge needs 10 to 2,000 characters.");
  const body = { schema: CHALLENGE_SCHEMA, run_id: c.runId, target: c.target, text, evidence_url: c.evidenceUrl ?? null };
  const { keys, txHash } = await backend.create([
    {
      payload: encodeRecord(body).bytes,
      contentType: "application/json",
      days: DAYS,
      attributes: { app: s(APP), kind: s("challenge"), run_id: s(c.runId), target: s(c.target) },
    },
  ]);
  return { key: keys[0], txHash };
}

/**
 * Extends a run and its facts on Arkiv. Signed by whoever holds the backend's key: any wallet can
 * keep a Stet brief alive (permissionlessExtension) without being able to change it.
 */
export async function keepAlive(backend: ArkivBackend, runId: string, days: number, publisher: Hex = STET_WRITER) {
  const runs = await backend.find({ app: APP, kind: "run", run_id: runId }, 10, { creator: publisher });
  const run = runs[0];
  if (!run) throw new Error(`No Stet run ${runId} from ${publisher} on Arkiv.`);
  const facts = await backend.find({ app: APP, kind: "fact", run_id: runId }, 200, { creator: publisher });
  const keys = [run.key, ...facts.map((f) => f.key)];
  const { txHash } = await backend.extend(keys, days);
  return { txHash, extended: keys.length };
}
