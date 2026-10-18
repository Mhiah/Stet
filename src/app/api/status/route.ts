import { connection } from "next/server";
import { storageAvailable } from "@/lib/store";

/**
 * Whether this deployment will run live, for checking a deployment's settings. Reports only
 * whether each variable is set, never its value.
 */
export async function GET() {
  await connection();
  const has = (name: string) => Boolean(process.env[name]?.trim());
  const forceMock = process.env.CRUX_MOCK === "1";
  const live = !forceMock && has("SERV_API_KEY") && has("TAVILY_API_KEY");
  return Response.json({
    mode: live ? "live" : "mock",
    SERV_API_KEY: has("SERV_API_KEY") ? "set" : "missing",
    TAVILY_API_KEY: has("TAVILY_API_KEY") ? "set" : "missing",
    CRUX_MOCK: forceMock ? "on (forces mock mode)" : "off",
    saves_runs: storageAvailable,
    // Which Vercel environment served this, and any similarly named variables, so a typo, a
    // stray space or an empty value shows up. Names and lengths only, never values.
    vercel_env: process.env.VERCEL_ENV ?? null,
    similar_variables: Object.keys(process.env)
      .filter((k) => /serv|tavily|crux/i.test(k))
      .map((k) => ({ name: JSON.stringify(k), value_length: process.env[k]?.length ?? 0 })),
  });
}
