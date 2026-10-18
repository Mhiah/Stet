/**
 * End-to-end check against the real Tiramisu testnet: publishes a sample run (mock research, no
 * SERV or Tavily credits), reads it back, verifies its hash, tampers with a copy, and lists
 * challenges. Prints the wallet address and entity keys for the submission.
 *
 *   npm run arkiv:check      (needs ARKIV_PRIVATE_KEY in .env.local)
 */
import { EXPLORER, SdkBackend } from "../src/lib/arkiv/backend";
import { listChallenges, listRuns, loadRecordText, loadRun, saveRun, verifyRun } from "../src/lib/arkiv/runs";
import { MockReasoning, MockSearch } from "../src/lib/mock/providers";
import { runResearch } from "../src/lib/pipeline";

process.env.STET_MOCK_DELAY_MS = "0";

async function main() {
  const chain = new SdkBackend(process.env.ARKIV_PRIVATE_KEY);
  if (!chain.writer) throw new Error("Set ARKIV_PRIVATE_KEY in .env.local (a funded Tiramisu wallet).");
  console.log(`Writer wallet: ${chain.writer}`);

  const project = await runResearch("Are small businesses actually willing to accept crypto payments?", {
    reasoning: new MockReasoning(),
    search: new MockSearch(),
  });
  console.log(`Sample run ${project.id}: ${project.research?.claims.length} facts`);

  const ref = await saveRun(chain, project);
  console.log(`✓ Published run  ${ref.key}  (tx ${ref.tx})\n  ${ref.explorer_url}`);

  const back = await loadRun(chain, project.id);
  if (!back?.arkiv?.intact) throw new Error("Read back failed or hash mismatch.");
  console.log(`✓ Read back from Arkiv, hash intact, read-only: ${back.arkiv.readonly}`);

  const copy = JSON.parse((await loadRecordText(chain, project.id))!);
  const clean = await verifyRun(chain, { runId: project.id }, copy);
  copy.conclusion.final_statement += " (edited)";
  const edited = await verifyRun(chain, { runId: project.id }, copy);
  console.log(`✓ Untouched copy matches: ${clean.found && clean.copy?.matches}`);
  console.log(`✓ Edited copy caught: ${edited.found && !edited.copy?.matches} (changed: ${edited.found ? edited.copy?.changed.join(", ") : ""})`);

  const runs = await listRuns(chain, { limit: 5 });
  console.log(`✓ Query finds ${runs.length} recent run(s)`);
  const challenges = await listChallenges(chain, project.id, chain.writer);
  console.log(`✓ Challenges on this run: ${challenges.length}`);
  console.log(`\nOpen it in the app at /research/${project.id}\nExplorer: ${EXPLORER}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
