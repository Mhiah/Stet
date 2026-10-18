import { listChallenges, trustedWriter } from "@/lib/arkiv/runs";
import { arkiv } from "@/lib/store";

/** Every challenge filed against a run, from any wallet. */
export async function GET(_req: Request, ctx: RouteContext<"/api/research/[id]/challenges">) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return Response.json({ error: "Invalid run id." }, { status: 400 });
  try {
    return Response.json({ challenges: await listChallenges(arkiv(), id, trustedWriter(arkiv())) });
  } catch (err) {
    return Response.json({ error: `Couldn't reach Arkiv: ${err instanceof Error ? err.message : String(err)}` }, { status: 502 });
  }
}
