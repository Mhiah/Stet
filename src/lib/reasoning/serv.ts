import OpenAI from "openai";
import { isCreditStatus, OutOfCredits } from "../credits";
import type { ReasoningProvider, ReasonRequest, ReasonResult } from "./provider";

/**
 * SERV Reasoning is OpenAI-compatible, so the official SDK works with a base URL swap.
 * https://docs.openserv.ai/serv-reasoning/why
 */
export const SERV_BASE_URL = process.env.SERV_BASE_URL || "https://inference-api.openserv.ai/v1";
export const SERV_MODEL = process.env.SERV_MODEL || "gpt-5.4-mini";
/** Far above any stage's output (the claim list, the largest, is a few thousand tokens). */
const MAX_OUTPUT_TOKENS = 16_000;

/**
 * SERV Tools are intercepted server-side. The prompt guard matters here because every
 * stage is fed excerpts from arbitrary web pages. The shadow agent re-checks each
 * stage's output against its input; it costs extra calls, so it is opt-in.
 */
function servTools(step: string): OpenAI.Chat.Completions.ChatCompletionTool[] {
  const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
    { type: "function", function: { name: "serv_prompt_guard", parameters: { type: "object", properties: {} } } },
  ];
  if (process.env.SERV_SHADOW_AGENT === "1") {
    tools.push({
      type: "function",
      function: {
        name: "serv_shadow_agent",
        parameters: {
          type: "object",
          properties: {
            hint: {
              type: "string",
              default: `Stage "${step}": check every cited ID exists in the input, every claim is grounded in the supplied evidence rather than prior knowledge, and nothing is overstated.`,
            },
            max_iterations: { type: "integer", default: 2 },
          },
        },
      },
    });
  }
  return tools;
}

/**
 * SERV's prompt guard intermittently blocks harmless requests: identical inputs were blocked
 * 3 in 4 times, then 0 in 10 minutes later. A block never reaches the model, so it comes back
 * as a refusal with zero tokens used; a genuine model refusal has token usage and isn't retried.
 */
const GUARD_RETRIES = 2;

class GuardBlocked extends Error {}

type ChatClient = Pick<OpenAI, "chat">;

export class ServProvider implements ReasoningProvider {
  readonly mode = "live" as const;
  private client: ChatClient;

  constructor(apiKey: string, private model = SERV_MODEL, client?: ChatClient) {
    this.client = client ?? new OpenAI({ apiKey, baseURL: SERV_BASE_URL });
  }

  async reason<T>(req: ReasonRequest): Promise<ReasonResult<T>> {
    // One retry on malformed output: strict schemas make this rare, but a truncated response would sink the whole run.
    let jsonRetries = 1;
    let guardRetries = GUARD_RETRIES;
    for (;;) {
      try {
        const res = await this.client.chat.completions.create({
          model: this.model,
          messages: [
            { role: "system", content: req.system },
            { role: "user", content: req.user },
          ],
          tools: servTools(req.step),
          response_format: { type: "json_schema", json_schema: req.schema },
          temperature: 0.2,
          // Left unset, SERV sometimes picks a limit above the model's 128k cap and rejects its own request.
          max_completion_tokens: MAX_OUTPUT_TOKENS,
        });
        const message = res.choices[0]?.message;
        if (message?.refusal) {
          if (!res.usage?.total_tokens) {
            throw new GuardBlocked(`SERV's prompt guard blocked the ${req.step} step ${GUARD_RETRIES + 1} times: ${message.refusal}`);
          }
          throw new Error(`SERV refused the ${req.step} step: ${message.refusal}`);
        }
        const content = message?.content;
        if (!content) throw new Error(`SERV returned no content for the ${req.step} step.`);
        return { output: JSON.parse(content) as T, model: res.model || this.model };
      } catch (err) {
        if (err instanceof OpenAI.APIError && isCreditStatus(err.status, err.message)) throw new OutOfCredits("SERV", err.message);
        if (err instanceof GuardBlocked && guardRetries-- > 0) continue;
        if (err instanceof SyntaxError) {
          if (jsonRetries-- > 0) continue;
          throw new Error(`SERV returned invalid JSON for the ${req.step} step.`);
        }
        throw err;
      }
    }
  }
}
