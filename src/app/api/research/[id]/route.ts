import { loadProject } from "@/lib/store";

export async function GET(_req: Request, ctx: RouteContext<"/api/research/[id]">) {
  const { id } = await ctx.params;
  const project = await loadProject(id).catch(() => null);
  if (!project) return Response.json({ error: "Project not found." }, { status: 404 });
  return Response.json(project);
}
