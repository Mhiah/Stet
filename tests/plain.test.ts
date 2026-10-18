import { describe, expect, it } from "vitest";
import { factCheckSummary, refsIn, stripRefs as strip } from "../src/lib/plain";

const KNOWN = new Set(["C1", "C2", "C3", "C4", "C6", "C9", "C11", "C12", "C21", "X1", "X2", "X3", "X4", "X6", "X7", "X8", "A2"]);
const stripRefs = (text: string) => strip(text, KNOWN);

describe("stripRefs", () => {
  it.each([
    // Real sentences from saved runs.
    ["The pain is real and well evidenced (C1, C2, C11).", "The pain is real and well evidenced."],
    [
      "Transaction-based lending (C12) is an early pilot, not yet a substitute at scale, so X4 weakens urgency without removing the need.",
      "Transaction-based lending is an early pilot, not yet a substitute at scale, so the stress test weakens urgency without removing the need.",
    ],
    ["the stress test correctly notes there is no direct evidence (X1, X6, X7, X8).", "the stress test correctly notes there is no direct evidence."],
    ["Assumption A2 fails because claims C3 and C4 show low willingness to pay.", "This assumption fails because these claims show low willingness to pay."],
    ["Pricing is thin [C9] and competition is crowded (see C6).", "Pricing is thin and competition is crowded."],
    ["X2 shows the market is small.", "The stress test shows the market is small."],
    ["Adoption barriers weaken the broad SME assumption (C21; X3).", "Adoption barriers weaken the broad SME assumption."],
    ["Nothing to remove here, 2025 figures and A-grade sources included.", "Nothing to remove here, 2025 figures and A-grade sources included."],
    // Abbreviations don't end a sentence, so the replacement stays lowercase.
    ["Some merchants, e.g. X2 shows, hold crypto.", "Some merchants, e.g. the stress test shows, hold crypto."],
    ["Demand in the U.S. X2 suggests is weak.", "Demand in the U.S. the stress test suggests is weak."],
    ["Cards vs. X4 remain cheaper.", "Cards vs. the stress test remain cheaper."],
    ["Fees are high. X4 disagrees.", "Fees are high. The stress test disagrees."],
    // Codes that aren't this run's records are ordinary words.
    ["The firm raised a Series A1 round and stores data on AWS S3.", "The firm raised a Series A1 round and stores data on AWS S3."],
    ["Pricing matters (C1, S3).", "Pricing matters (C1, S3)."],
    // Ranges read as one citation, not "the evidence-the evidence".
    ["These claims (C1-C3) still point the same way.", "These claims still point the same way."],
    ["Claims C1–C4 still point the same way.", "These claims still point the same way."],
    ["The pattern holds across C2 to C4.", "The pattern holds across the evidence."],
  ])("%s", (input, expected) => {
    expect(stripRefs(input)).toBe(expected);
  });
});

describe("stripDashes (via stripRefs)", () => {
  it.each([
    ["Yes—there is enough evidence to support launching.", "Yes, there is enough evidence to support launching."],
    ["The market — especially micro firms — is price-sensitive.", "The market, especially micro firms, is price-sensitive."],
    ["Interview 15–20 owners across 3–4 sectors.", "Interview 15-20 owners across 3-4 sectors."],
    ["The UK–Nigeria corridor is large – but crowded.", "The UK-Nigeria corridor is large, but crowded."],
    ["It survived — .", "It survived."],
    ["Between 15 – 20 owners from 2020 - 2024.", "Between 15-20 owners from 2020-2024."],
    ["Well-known, low-cost tools stay hyphenated.", "Well-known, low-cost tools stay hyphenated."],
  ])("%s", (input, expected) => {
    expect(stripRefs(input)).toBe(expected);
  });
});

describe("refsIn", () => {
  it("finds each cited ID once, in order", () => {
    expect(refsIn("evidenced (C1, C2), so X4 weakens A2; see C1")).toEqual(["C1", "C2", "X4", "A2"]);
    expect(refsIn("no ids in 2025, COVID-19 or A-grade")).toEqual([]);
  });
});

describe("factCheckSummary", () => {
  it("accounts for every extracted fact", () => {
    expect(factCheckSummary({ extracted: 30, dropped: 2, merged: 1, flagged: 0 })).toBe(
      "2 of 30 extracted facts were dropped because their quotes weren't in the source, and 1 was a duplicate merged into another fact.",
    );
    expect(factCheckSummary({ extracted: 12, dropped: 0, flagged: 2 })).toBe(
      "All 12 extracted facts passed. 2 are flagged for figures their quote doesn't contain.",
    );
  });
});
