/**
 * A service said its credits or usage limit are used up. The run then switches to the sample
 * data (mock mode) instead of failing, and says why.
 */
export class OutOfCredits extends Error {
  constructor(
    readonly service: "SERV" | "Tavily",
    detail: string,
  ) {
    super(`${service} credits have run out: ${detail}`);
  }
}

const CREDIT_WORDS = /credit|quota|insufficient|balance|usage limit|plan limit|billing|payment/i;

/** 402 always means payment; 403 and 429 only when the message is about credits, not rate or access. */
export function isCreditStatus(status: number | undefined, message: string): boolean {
  if (status === 402) return true;
  if (status === 403 || status === 429) return CREDIT_WORDS.test(message);
  return false;
}
