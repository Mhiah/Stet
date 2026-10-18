import { connection } from "next/server";
import { arkiv, storageAvailable } from "@/lib/store";

/**
 * Whether this deployment will run live and write to Arkiv, for checking a deployment's
 * settings. Reports only whether each secret is set, never its value.
 */
export async function GET() {
  await connection();
  const has = (name: string) => Boolean(process.env[name]?.trim());
  const forceMock = process.env.STET_MOCK === "1";
  const live = !forceMock && has("SERV_API_KEY") && has("TAVILY_API_KEY");
  let writer: string | null = null;
  let arkivError: string | null = null;
  try {
    writer = arkiv().writer;
  } catch (err) {
    arkivError = err instanceof Error ? err.message : String(err);
  }
  return Response.json({
    mode: live ? "live" : "mock",
    SERV_API_KEY: has("SERV_API_KEY") ? "set" : "missing",
    TAVILY_API_KEY: has("TAVILY_API_KEY") ? "set" : "missing",
    ARKIV_PRIVATE_KEY: has("ARKIV_PRIVATE_KEY") ? "set" : "missing",
    STET_MOCK: forceMock ? "on (forces mock mode)" : "off",
    arkiv_network: "Tiramisu (chain 7738577)",
    // The public address that writes runs; it goes in the submission.
    arkiv_writer: writer,
    arkiv_error: arkivError,
    saves_runs: arkivError ? false : storageAvailable(),
    vercel_env: process.env.VERCEL_ENV ?? null,
    // Similarly named variables, so a typo, a stray space or an empty value shows up.
    // Names and lengths only, never values.
    similar_variables: Object.keys(process.env)
      .filter((k) => /serv|tavily|arkiv|stet/i.test(k))
      .map((k) => ({ name: JSON.stringify(k), value_length: process.env[k]?.length ?? 0 })),
  });
}
