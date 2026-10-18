import { beforeAll, describe, expect, it } from "vitest";
import { MemoryBackend } from "../src/lib/arkiv/backend";
import { canonicalJson, encodeRecord, PAYLOAD_LIMIT, sha256Hex, toRunRecord } from "../src/lib/arkiv/record";
import { keepAlive, listChallenges, listRuns, loadRecordText, loadRun, postChallenge, saveRun, verifyRun } from "../src/lib/arkiv/runs";
import { MockReasoning, MockSearch } from "../src/lib/mock/providers";
import { runResearch } from "../src/lib/pipeline";
import type { ResearchProject } from "../src/lib/types";

process.env.STET_MOCK_DELAY_MS = "0";
const QUESTION = "Should we launch an AI bookkeeping SaaS for Nigerian SMEs?";

let project: ResearchProject;
beforeAll(async () => {
  project = await runResearch(QUESTION, { reasoning: new MockReasoning(), search: new MockSearch() });
});

describe("run record", () => {
  it("serialises the same run to the same bytes whatever the key order", () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: [{ z: 1, y: 2 }] } })).toBe('{"a":{"c":[{"y":2,"z":1}],"d":2},"b":1}');
    const a = encodeRecord(toRunRecord(project));
    const b = encodeRecord(toRunRecord(structuredClone(project)));
    expect(a.hash).toBe(b.hash);
    expect(a.hash).toBe(sha256Hex(a.bytes));
  });

  it("fits a full run in one entity and keeps a hash of every trimmed excerpt", () => {
    const record = toRunRecord(project);
    expect(encodeRecord(record).bytes.length).toBeLessThan(PAYLOAD_LIMIT);
    for (const s of record.research!.sources as { excerpt_sha256?: string }[]) {
      expect(s.excerpt_sha256).toMatch(/^0x[0-9a-f]{64}$/);
    }
    expect(record.lineage).toBe(project.id);
  });

  it("never hashes the arkiv reference itself", () => {
    const withRef = { ...project, arkiv: { key: "0x01" } as unknown as ResearchProject["arkiv"] };
    expect(encodeRecord(toRunRecord(withRef)).hash).toBe(encodeRecord(toRunRecord(project)).hash);
  });
});

describe("runs on Arkiv", () => {
  it("writes a run and one entity per fact, then reopens the run by id", async () => {
    const chain = new MemoryBackend();
    const ref = await saveRun(chain, project);
    const facts = [...chain.entities.values()].filter((e) => e.attributes.kind === "fact");
    expect(facts).toHaveLength(project.research!.claims.length);
    expect(facts.every((f) => f.attributes.run === ref.key && f.readonly)).toBe(true);

    const back = await loadRun(chain, project.id);
    expect(back?.conclusion?.final_statement).toBe(project.conclusion!.final_statement);
    expect(back?.arkiv?.intact).toBe(true);
    expect(back?.arkiv?.readonly).toBe(true);
    expect(back?.arkiv?.content_sha256).toBe(ref.content_sha256);
  });

  it("ignores a run with the same id written by another wallet", async () => {
    const chain = new MemoryBackend();
    const imposter = new MemoryBackend("0x000000000000000000000000000000000000bad0");
    const fake = await saveRun(imposter, { ...project, question: "forged" });
    const e = imposter.entities.get(fake.key)!;
    chain.entities.set(e.key, e);
    expect(await loadRun(chain, project.id)).toBeNull();
    await saveRun(chain, project);
    expect((await loadRun(chain, project.id))?.question).toBe(QUESTION);
  });

  it("revises by publishing a new run that keeps the original's lineage", async () => {
    const chain = new MemoryBackend();
    await saveRun(chain, project);
    const second = await runResearch(QUESTION, { reasoning: new MockReasoning(), search: new MockSearch() });
    const ref = await saveRun(chain, second, { supersedes: project.id });
    expect(ref.lineage).toBe(project.id);
    const line = await listRuns(chain, { lineage: project.id });
    expect(line.map((r) => r.run_id).sort()).toEqual([project.id, second.id].sort());
    expect((await loadRun(chain, project.id))?.conclusion).toEqual(project.conclusion);
    await expect(saveRun(chain, second, { supersedes: "00000000-0000-0000-0000-000000000000" })).rejects.toThrow(/isn't on Arkiv/);
  });
});

describe("tamper check", () => {
  it("matches an untouched copy and names what changed in an edited one", async () => {
    const chain = new MemoryBackend();
    await saveRun(chain, project);
    const copy = JSON.parse((await loadRecordText(chain, project.id))!);

    const clean = await verifyRun(chain, { runId: project.id }, copy);
    expect(clean.found && clean.chain_intact && clean.copy?.matches).toBe(true);

    copy.conclusion.confidence = copy.conclusion.confidence === "high" ? "low" : "high";
    const edited = await verifyRun(chain, { runId: project.id }, copy);
    expect(edited.found && edited.copy?.matches).toBe(false);
    expect(edited.found && edited.copy?.changed).toEqual(["conclusion.confidence"]);
  });

  it("flags a stored payload that no longer hashes to its recorded value", async () => {
    const chain = new MemoryBackend();
    const ref = await saveRun(chain, project);
    const e = chain.entities.get(ref.key)!;
    chain.entities.set(ref.key, { ...e, payload: new TextEncoder().encode(new TextDecoder().decode(e.payload).replace(QUESTION, "edited")) });
    const res = await verifyRun(chain, { key: ref.key });
    expect(res.found && res.chain_intact).toBe(false);
  });
});

describe("challenges", () => {
  it("lists counter-claims from any wallet and marks the independent ones", async () => {
    const chain = new MemoryBackend();
    await saveRun(chain, project);
    const challenger = "0x000000000000000000000000000000000000c0de" as const;
    const other = new MemoryBackend(challenger);
    const posted = await postChallenge(other, { runId: project.id, target: "C2", text: "This figure is from 2019, not 2025.", evidenceUrl: "https://example.org" });
    chain.entities.set(posted.key, other.entities.get(posted.key)!);
    await postChallenge(chain, { runId: project.id, target: "conclusion", text: "Our own note on the conclusion." });

    const list = await listChallenges(chain, project.id, chain.writer);
    expect(list).toHaveLength(2);
    expect(list.find((c) => c.target === "C2")).toMatchObject({ owner: challenger, independent: true });
    expect(list.find((c) => c.target === "conclusion")?.independent).toBe(false);
    await expect(postChallenge(chain, { runId: project.id, target: "C1", text: "short" })).rejects.toThrow(/10 to 2,000/);
  });
});

describe("trust and keeping alive", () => {
  it("trusts $creator, not the owner: a run transferred to Stet's writer still doesn't count", async () => {
    const chain = new MemoryBackend();
    const imposter = new MemoryBackend("0x000000000000000000000000000000000000bad0");
    const fake = await saveRun(imposter, { ...project, question: "forged" });
    const e = imposter.entities.get(fake.key)!;
    // Ownership can be transferred; the creator can't. Pretend the forger handed it to Stet's wallet.
    chain.entities.set(e.key, { ...e, owner: chain.writer });
    expect(await loadRun(chain, project.id)).toBeNull();
    expect((await verifyRun(chain, { key: e.key })).found).toBe(false);
  });

  it("lets any wallet extend a brief and its facts", async () => {
    const chain = new MemoryBackend();
    await saveRun(chain, project);
    const run = (await chain.find({ app: "stet", kind: "run", run_id: project.id }))[0];
    const before = run.expiresAt!;
    const res = await keepAlive(chain, project.id, 30, chain.writer!);
    expect(res.extended).toBe(1 + project.research!.claims.length);
    expect(chain.entities.get(run.key)!.expiresAt! > before).toBe(true);
  });
});
