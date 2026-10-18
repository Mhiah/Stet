/**
 * Fact checking for extracted claims, in plain code (no model calls). SERV must quote the
 * exact words each claim rests on; a quote only counts if it's actually in that source's
 * excerpt, and figures in the claim should appear in its verified quotes.
 */

/** Shorter quotes ("68%", "the market") would match almost anything. */
const MIN_QUOTE_CHARS = 20;
const MIN_PART_CHARS = 8;

/** Case, curly quotes, dashes, markdown and whitespace differ between excerpt and quote without changing the words. */
export function normalize(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[‘’‛`]/g, "'")
    .replace(/[“”„]/g, '"')
    .replace(/[‐‑‒–—−]/g, "-")
    .replace(/[*_#>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const trimPart = (part: string) => part.replace(/^[\s"'.,;:!?()-]+|[\s"'.,;:!?()-]+$/g, "");

/**
 * True when every part of `quote` appears in `source`, in order. Parts are separated by an
 * ellipsis, which models use to skip words ("...", "…", or Tavily's own "[...]").
 */
export function quoteFound(quote: string, source: string): boolean {
  const q = normalize(quote);
  const parts = q
    .split(/\[\.\.\.\]|\.\.\.|…/)
    .map(trimPart)
    .filter(Boolean);
  if (parts.length === 0 || parts.join(" ").length < MIN_QUOTE_CHARS || parts.some((p) => p.length < MIN_PART_CHARS)) {
    return false;
  }
  const haystack = normalize(source);
  let from = 0;
  for (const part of parts) {
    const at = haystack.indexOf(part, from);
    if (at < 0) return false;
    from = at + part.length;
  }
  return true;
}

const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const NUMBER_WORD = new RegExp(`\\b(?:(${TENS.slice(2).join("|")})(?:[-\\s](${ONES.slice(1, 10).join("|")}))?|(${ONES.join("|")}))\\b`, "gi");

/** Sources often spell small numbers out: "Thirty-three percent" states the same figure as "33%". */
function spelledNumbersToDigits(text: string): string {
  return text.replace(NUMBER_WORD, (_m, tens?: string, unit?: string, single?: string) =>
    String(single ? ONES.indexOf(single.toLowerCase()) : TENS.indexOf(tens!.toLowerCase()) * 10 + (unit ? ONES.indexOf(unit.toLowerCase()) : 0)),
  );
}

/**
 * Figures as written, minus thousands separators: "₦3,000" → "3000", "45.2%" → "45.2".
 * With `spelled`, number words count too ("thirty-three" → "33").
 */
export function numbersIn(text: string, { spelled = false } = {}): Set<string> {
  return new Set(
    [...(spelled ? spelledNumbersToDigits(text) : text).matchAll(/\d+(?:[.,]\d+)*/g)].map((m) => m[0].replace(/,(?=\d{3}\b)/g, "").replace(/\.0+$/, "")),
  );
}

/**
 * Figures the claim states in digits that none of its verified quotes contain, in digits or
 * words. Only the quotes' number words are read, so ordinary words in a claim ("one of the
 * largest") never become figures to check.
 */
export function unmatchedNumbers(claim: string, quotes: string[]): string[] {
  const quoted = numbersIn(quotes.join(" "), { spelled: true });
  return [...numbersIn(claim)].filter((n) => !quoted.has(n));
}
