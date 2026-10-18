/**
 * Keep a Stet brief alive on Arkiv from your own wallet. Stet's entities are created with
 * permissionlessExtension, so any wallet can extend a brief and its facts without being able to
 * change them. If Stet stops paying to keep a brief alive, anyone who needs it can.
 *
 *   KEEPER_PRIVATE_KEY=0x… npm run extend -- --run <run id> [--days 90]
 */
import { EXPLORER, SdkBackend } from "../src/lib/arkiv/backend";
import { keepAlive, STET_WRITER } from "../src/lib/arkiv/runs";

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const runId = arg("run");
  const days = Number(arg("days") ?? 90);
  const key = process.env.KEEPER_PRIVATE_KEY;
  if (!runId) throw new Error("Usage: npm run extend -- --run <run id> [--days 90]");
  if (!key) throw new Error("Set KEEPER_PRIVATE_KEY to your own funded Tiramisu wallet's key.");
  if (!Number.isInteger(days) || days < 1) throw new Error("--days must be a whole number of days.");

  const me = new SdkBackend(key);
  const publisher = (process.env.STET_WRITER_ADDRESS?.trim() || STET_WRITER) as `0x${string}`;
  const { txHash, extended } = await keepAlive(me, runId, days, publisher);
  console.log(`Extended ${extended} entities (the brief and its facts) by ${days} days, signed by ${me.writer}`);
  console.log(`Tx: ${txHash}\n${EXPLORER}/tx/${txHash}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
