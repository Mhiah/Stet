import { runResearch } from "@/lib/pipeline";
import { MockReasoning, MockSearch } from "@/lib/mock/providers";
import { getProviders } from "@/lib/providers";
import { saveProject, storageAvailable } from "@/lib/store";

// A full run makes six SERV calls plus searches, then two Arkiv transactions; allow well over the default limit.
export const maxDuration = 300;

const UUID = /^[0-9a-f-]{36}$/;

/**
 * Runs the pipeline and streams PipelineEvents as NDJSON, one event per line. The finished run
 * is written to Arkiv. `supersedes` makes it a revision of an earlier run instead of an edit.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { question?: unknown; supersedes?: unknown } | null;
  const question = typeof body?.question === "string" ? body.question.trim() : "";
  if (question.length < 10 || question.length > 500) {
    return Response.json({ error: "Ask a research question between 10 and 500 characters." }, { status: 400 });
  }
  const supersedes = typeof body?.supersedes === "string" && UUID.test(body.supersedes) ? body.supersedes : null;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        await runResearch(question, {
          ...getProviders(),
          save: storageAvailable() ? (p) => saveProject(p, { supersedes }) : undefined,
          fallback: { reasoning: new MockReasoning(), search: new MockSearch() },
          onEvent: (event) => controller.enqueue(encoder.encode(JSON.stringify(event) + "\n")),
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache, no-transform" },
  });
}
