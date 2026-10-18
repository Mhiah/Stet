/**
 * Run the pipeline from the terminal: npm run research -- "Should we launch ...?"
 * Uses SERV_API_KEY / TAVILY_API_KEY from .env.local when present, mock providers otherwise.
 */
import { runResearch } from "../src/lib/pipeline";
import { getProviders } from "../src/lib/providers";
import { saveProject } from "../src/lib/store";

const question = process.argv.slice(2).join(" ").trim() || "Should we launch an AI bookkeeping SaaS for Nigerian SMEs?";

async function main() {
  const providers = getProviders();
  console.log(`Question: ${question}`);
  console.log(`Reasoning: ${providers.reasoning.mode}, search: ${providers.search.mode}\n`);

  const project = await runResearch(question, {
    ...providers,
    save: saveProject,
    onEvent: (e) => {
      if (e.type === "stage_started") process.stdout.write(`→ ${e.stage}… `);
      if (e.type === "stage_completed") {
        console.log(`done in ${(e.audit.duration_ms / 1000).toFixed(1)}s`);
        for (const w of e.audit.warnings) console.log(`  ! ${w}`);
      }
      if (e.type === "error") console.log(`\n✗ ${e.stage ?? "pipeline"} failed: ${e.message}`);
    },
  });

  if (project.status !== "complete") process.exit(1);
  const wc = project.what_changed!;
  console.log(`\nInitial thesis (${wc.initial.confidence}): ${wc.initial.statement}`);
  console.log(`\nStress test: ${wc.challenged.length} challenges, thesis ${wc.verdict}.`);
  for (const a of wc.assumptions) console.log(`  [${a.assumption_id}] ${a.verdict}: ${a.text}`);
  console.log(`\nConclusion (${wc.final.confidence}): ${wc.final.statement}`);
  console.log(`\nNext validation:`);
  for (const s of project.conclusion!.next_validation_steps) console.log(`  - ${s.step}`);
  console.log(`\nSaved project ${project.id}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
