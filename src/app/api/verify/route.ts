import type { Hex } from "viem";
import { verifyRun } from "@/lib/arkiv/runs";
import { arkiv } from "@/lib/store";

/**
 * Checks a run against Arkiv. Body: `{ run_id }` or `{ key }`, plus an optional `copy` (a
 * downloaded record) to compare with what the chain holds.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { run_id?: unknown; key?: unknown; copy?: unknown } | null;
  const runId = typeof body?.run_id === "string" && /^[0-9a-f-]{36}$/.test(body.run_id) ? body.run_id : undefined;
  const key = typeof body?.key === "string" && /^0x[0-9a-fA-F]{64}$/.test(body.key) ? (body.key as Hex) : undefined;
  if (!runId && !key) return Response.json({ error: "Give a run id or an Arkiv entity key." }, { status: 400 });
  try {
    return Response.json(await verifyRun(arkiv(), { runId, key }, body?.copy));
  } catch (err) {
    return Response.json({ error: `Couldn't reach Arkiv: ${err instanceof Error ? err.message : String(err)}` }, { status: 502 });
  }
}
