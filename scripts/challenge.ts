/**
 * File a challenge against a Stet brief from your own wallet. It is written to Arkiv under your
 * address, not Stet's, so Stet has no way to remove it.
 *
 *   CHALLENGER_PRIVATE_KEY=0x… npm run challenge -- --run <run id> --target C3 \
 *     --text "What the brief gets wrong" --url https://evidence
 *
 * --target is a fact id (C1…), an assumption id (A1…), or "conclusion". Use a funded Tiramisu
 * testnet wallet and synthetic or public information only.
 */
import { SdkBackend } from "../src/lib/arkiv/backend";
import { EXPLORER } from "../src/lib/arkiv/backend";
import { loadRun, postChallenge } from "../src/lib/arkiv/runs";

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const runId = arg("run");
  const text = arg("text");
  const target = arg("target") ?? "conclusion";
  const url = arg("url") ?? null;
  const key = process.env.CHALLENGER_PRIVATE_KEY;
  if (!runId || !text) throw new Error("Usage: npm run challenge -- --run <run id> --target C3 --text \"…\" [--url https://…]");
  if (!key) throw new Error("Set CHALLENGER_PRIVATE_KEY to your own funded Tiramisu wallet's key.");

  const me = new SdkBackend(key);
  const run = await loadRun(new SdkBackend(), runId);
  if (!run) throw new Error(`No Stet run ${runId} on Arkiv.`);
  const ids = new Set(["conclusion", ...(run.research?.claims ?? []).map((c) => c.id), ...(run.thesis?.assumptions ?? []).map((a) => a.id)]);
  if (!ids.has(target)) throw new Error(`--target must be one of: ${[...ids].join(", ")}`);

  const { key: entity, txHash } = await postChallenge(me, { runId, target, text, evidenceUrl: url });
  console.log(`Challenge filed by ${me.writer}`);
  console.log(`Entity: ${entity}\nTx:     ${txHash}\n${EXPLORER}/entity/${entity}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
