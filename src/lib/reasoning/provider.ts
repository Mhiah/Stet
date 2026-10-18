import type { StrictSchema } from "./schemas";

export type ReasonRequest = {
  /** Which pipeline step is asking; used for logging and by the mock provider. */
  step: string;
  system: string;
  user: string;
  schema: StrictSchema;
};

export type ReasonResult<T> = { output: T; model: string };

/** Anything that turns a prompt + strict schema into structured output. SERV in production, a fixture in mock mode. */
export interface ReasoningProvider {
  readonly mode: "live" | "mock";
  reason<T>(req: ReasonRequest): Promise<ReasonResult<T>>;
}
