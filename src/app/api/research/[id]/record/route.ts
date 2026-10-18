import { loadRecordText } from "@/lib/arkiv/runs";
import { arkiv } from "@/lib/store";

/** The run's record exactly as stored on Arkiv, as a file. Its SHA-256 is the run's content_sha256. */
export async function GET(_req: Request, ctx: RouteContext<"/api/research/[id]/record">) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return Response.json({ error: "Invalid run id." }, { status: 400 });
  const text = await loadRecordText(arkiv(), id).catch(() => null);
  if (!text) return Response.json({ error: "Run not found on Arkiv." }, { status: 404 });
  return new Response(text, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="stet-record-${id}.json"`,
    },
  });
}
