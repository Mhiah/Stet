import { listRuns } from "@/lib/arkiv/runs";
import { arkiv } from "@/lib/store";

/** Recent runs on Arkiv, newest first. `?lineage=<run id>` lists one run's revisions. */
export async function GET(req: Request) {
  const lineage = new URL(req.url).searchParams.get("lineage") ?? undefined;
  try {
    return Response.json({ runs: await listRuns(arkiv(), { lineage, limit: 50 }) });
  } catch (err) {
    return Response.json({ error: `Couldn't reach Arkiv: ${err instanceof Error ? err.message : String(err)}` }, { status: 502 });
  }
}
