/**
 * Illustrative fixtures for offline development and demos without API keys.
 * Built around the build plan's example question. Every source is on example.org and
 * titled "[Mock]" so a mock run can never be mistaken for real research.
 */
import type { SearchResult } from "../research/search";

export const MOCK_SEARCH_RESULTS: SearchResult[] = [
  {
    url: "https://example.org/mock/sme-digitisation-survey",
    title: "[Mock] SME Digitisation Survey: Lagos, Abuja and Kano",
    content:
      "Illustrative data. In a survey of 1,200 small businesses, 68% said they still keep records in paper ledgers or notebooks, and 54% said poor record-keeping had cost them a loan application in the past two years. 71% of owners use a smartphone for business daily, mostly for WhatsApp and mobile banking.",
    score: 0.94,
    published_date: "2025-11-02",
  },
  {
    url: "https://example.org/mock/tax-reform-explainer",
    title: "[Mock] What the new tax administration rules mean for small businesses",
    content:
      "Illustrative data. The reforms extend e-invoicing and require businesses above a turnover threshold to keep digital records available for inspection. Businesses below the threshold are exempt from most filing obligations. Enforcement is expected to be phased over three years.",
    score: 0.91,
    published_date: "2026-03-18",
  },
  {
    url: "https://example.org/mock/fintech-landscape",
    title: "[Mock] Fintech landscape: payments, lending and SME tools",
    content:
      "Illustrative data. Several payments and POS providers now bundle free basic bookkeeping (sales logs, expense tracking) into their merchant apps. Two venture-backed SME accounting startups raised seed rounds in 2025. Global accounting suites have a small presence, mainly among firms with 20+ employees.",
    score: 0.88,
    published_date: "2026-01-10",
  },
  {
    url: "https://example.org/mock/willingness-to-pay-study",
    title: "[Mock] Pricing software for informal and micro businesses",
    content:
      "Illustrative data. Among micro businesses, the median stated willingness to pay for business software was under ₦3,000 per month, and fewer than 15% of trial users converted to paid plans after a free period. Owners valued tools that directly helped them get paid or get credit over tools that only kept records.",
    score: 0.86,
    published_date: "2025-08-21",
  },
  {
    url: "https://example.org/mock/credit-access-report",
    title: "[Mock] Closing the SME credit gap",
    content:
      "Illustrative data. Lenders cite missing financial records as the top reason for rejecting small business loan applications. Lenders piloting cash-flow-based underwriting accept bank and mobile-money transaction history in place of formal accounts.",
    score: 0.83,
    published_date: "2025-06-30",
  },
  {
    url: "https://example.org/mock/ai-adoption-smes",
    title: "[Mock] AI adoption among African SMEs",
    content:
      "Illustrative data. Awareness of AI tools among SME owners is high, but trust is low: 61% said they would not let software categorise their finances without checking it. Voice and local-language support increased engagement in pilots by roughly a third.",
    score: 0.8,
    published_date: "2026-02-14",
  },
  {
    url: "https://example.org/mock/accountant-channel",
    title: "[Mock] The role of accountants and cooperatives in SME finance",
    content:
      "Illustrative data. Many small businesses rely on an external accountant or bookkeeper once a year for tax filing. Trade associations and cooperatives are the most trusted channel for new business tools, ahead of online advertising.",
    score: 0.77,
    published_date: "2025-12-05",
  },
  {
    url: "https://example.org/mock/connectivity-costs",
    title: "[Mock] Data costs and connectivity for small traders",
    content:
      "Illustrative data. Mobile data prices rose in 2025, and intermittent connectivity remains common outside major cities. Apps that work offline and sync later retain users better in trader markets.",
    score: 0.74,
    published_date: "2026-04-01",
  },
];

export const MOCK_QUERY_PLAN = {
  supporting_queries: [
    "Nigeria SME bookkeeping record keeping survey",
    "Nigeria tax reform e-invoicing small business digital records",
    "SME loan rejection financial records Nigeria",
  ],
  challenging_queries: [
    "free bookkeeping in POS and payments apps Nigeria competition",
    "micro business software low willingness to pay Nigeria",
    "small businesses distrust AI finance tools Africa",
  ],
};

/** Every quote is copied from the fixture excerpts above, so mock runs pass fact checking. */
const claim = (text: string, category: string, stance: string, ...quotes: [string, string][]) => ({
  text,
  quotes: quotes.map(([source_id, quote]) => ({ source_id, text: quote })),
  category,
  stance,
});

export const MOCK_CLAIMS = {
  claims: [
    claim("68% of surveyed small businesses keep records in paper ledgers or notebooks.", "market_demand", "supports", ["S1", "68% said they still keep records in paper ledgers or notebooks"]),
    claim("54% of surveyed owners say poor record-keeping cost them a loan application in the past two years.", "customers", "supports", ["S1", "54% said poor record-keeping had cost them a loan application in the past two years"]),
    claim("71% of SME owners use a smartphone for business daily.", "adoption", "supports", ["S1", "71% of owners use a smartphone for business daily"]),
    claim("Tax reforms require businesses above a turnover threshold to keep digital records, phased in over three years.", "regulation", "supports", ["S2", "require businesses above a turnover threshold to keep digital records available for inspection"], ["S2", "Enforcement is expected to be phased over three years."]),
    claim("Businesses below the turnover threshold are exempt from most filing obligations.", "regulation", "challenges", ["S2", "Businesses below the threshold are exempt from most filing obligations."]),
    claim("Payments and POS providers bundle free basic bookkeeping into their merchant apps.", "competition", "challenges", ["S3", "Several payments and POS providers now bundle free basic bookkeeping"]),
    claim("Two venture-backed SME accounting startups raised seed rounds in 2025.", "competition", "neutral", ["S3", "Two venture-backed SME accounting startups raised seed rounds in 2025."]),
    claim("Median stated willingness to pay for business software among micro businesses is under ₦3,000 per month.", "pricing", "challenges", ["S4", "the median stated willingness to pay for business software was under ₦3,000 per month"]),
    claim("Fewer than 15% of micro-business trial users converted to paid plans.", "pricing", "challenges", ["S4", "fewer than 15% of trial users converted to paid plans after a free period"]),
    claim("Owners value tools that help them get paid or get credit over tools that only keep records.", "customers", "neutral", ["S4", "Owners valued tools that directly helped them get paid or get credit over tools that only kept records."]),
    claim("Lenders cite missing financial records as the top reason for rejecting small business loans.", "customers", "supports", ["S5", "Lenders cite missing financial records as the top reason for rejecting small business loan applications."]),
    claim("Some lenders accept bank and mobile-money transaction history in place of formal accounts.", "trends", "challenges", ["S5", "accept bank and mobile-money transaction history in place of formal accounts"]),
    claim("61% of SME owners would not let software categorise their finances without checking it.", "adoption", "challenges", ["S6", "61% said they would not let software categorise their finances without checking it"]),
    claim("Voice and local-language support increased engagement in pilots by roughly a third.", "adoption", "supports", ["S6", "Voice and local-language support increased engagement in pilots by roughly a third."]),
    claim("Trade associations and cooperatives are the most trusted channel for new business tools.", "customers", "neutral", ["S7", "Trade associations and cooperatives are the most trusted channel for new business tools"]),
    claim("Offline-capable apps retain users better in trader markets with intermittent connectivity.", "adoption", "neutral", ["S8", "intermittent connectivity remains common outside major cities"], ["S8", "Apps that work offline and sync later retain users better in trader markets."]),
  ],
};

export const MOCK_THESIS = {
  statement:
    "There is a viable opportunity for an AI bookkeeping SaaS for Nigerian SMEs: most still keep paper records, poor records block access to credit, smartphone use is near-universal, and tax reforms are pushing businesses toward digital records.",
  confidence: "medium",
  confidence_rationale:
    "Demand-side evidence is strong (C1, C2, C3, C11) and regulation adds a tailwind (C4), but pricing and competition evidence is thin at this stage.",
  assumptions: [
    { text: "SMEs feel the pain of poor record-keeping strongly enough to adopt a new tool.", supporting_claim_ids: ["C1", "C2", "C11"] },
    { text: "SMEs will pay a subscription large enough to sustain the business.", supporting_claim_ids: [] },
    { text: "Tax reforms will push a large share of SMEs to keep digital records.", supporting_claim_ids: ["C4"] },
    { text: "AI categorisation is a meaningful advantage over existing tools.", supporting_claim_ids: ["C3"] },
  ],
  supporting_claim_ids: ["C1", "C2", "C3", "C4", "C11"],
  uncertainties: ["How much SMEs will pay", "How strong competition from bundled free tools is"],
};

export const MOCK_STRESS_TEST = {
  challenges: [
    {
      kind: "contradictory_evidence",
      text: "Stated willingness to pay is under ₦3,000/month and fewer than 15% of trial users convert. A subscription business may not be sustainable at that price.",
      target_assumption_ids: ["A2"],
      claim_ids: ["C8", "C9"],
      severity: "critical",
    },
    {
      kind: "contradictory_evidence",
      text: "Payments and POS apps already give basic bookkeeping away for free, so the entry-level product is being commoditised by players with existing merchant relationships.",
      target_assumption_ids: ["A2", "A4"],
      claim_ids: ["C6"],
      severity: "major",
    },
    {
      kind: "weak_assumption",
      text: "The regulatory push mostly hits businesses above the turnover threshold. The smallest SMEs, the bulk of the market, are exempt.",
      target_assumption_ids: ["A3"],
      claim_ids: ["C5"],
      severity: "major",
    },
    {
      kind: "alternative_explanation",
      text: "The credit problem may be solved without bookkeeping: lenders are starting to underwrite from transaction history, which removes the main reason to keep books.",
      target_assumption_ids: ["A1"],
      claim_ids: ["C12"],
      severity: "major",
    },
    {
      kind: "risk",
      text: "Low trust in automated categorisation could turn the 'AI' feature into friction rather than a selling point.",
      target_assumption_ids: ["A4"],
      claim_ids: ["C13"],
      severity: "minor",
    },
  ],
  failure_conditions: [
    "Paid conversion stays below 10% at any viable price point.",
    "Payment providers extend free bookkeeping to include tax and credit features.",
    "Cash-flow-based lending becomes the norm before bookkeeping habits form.",
  ],
  missing_evidence: [
    { question: "What would SMEs above the tax threshold pay for compliance-ready records?", why_it_matters: "This is the segment the regulation actually compels." },
    { question: "Would lenders or payment providers pay for distribution or data partnerships?", why_it_matters: "A B2B2C model could remove the dependence on SME willingness to pay." },
  ],
};

export const MOCK_REEVALUATION = {
  assessments: [
    {
      assumption_id: "A1",
      verdict: "supported",
      reasoning: "The pain is real and well evidenced (C1, C2, C11). Transaction-based lending (C12) is an early pilot, not yet a substitute at scale, so X4 weakens urgency without removing the need.",
      claim_ids: ["C1", "C2", "C11", "C12"],
      challenge_ids: ["X4"],
    },
    {
      assumption_id: "A2",
      verdict: "weakened",
      reasoning: "The only direct pricing evidence (C8, C9) points to low willingness to pay, and free bundled tools (C6) anchor prices lower still. Nothing in the evidence contradicts this.",
      claim_ids: ["C6", "C8", "C9"],
      challenge_ids: ["X1", "X2"],
    },
    {
      assumption_id: "A3",
      verdict: "weakened",
      reasoning: "Regulation compels digital records only above the turnover threshold (C4, C5). It is a real driver for larger SMEs, not for the micro-business majority.",
      claim_ids: ["C4", "C5"],
      challenge_ids: ["X3"],
    },
    {
      assumption_id: "A4",
      verdict: "unresolved",
      reasoning: "Low trust in automation (C13) cuts against AI as a selling point, but local-language and voice features lifted engagement (C14). The evidence does not settle whether AI differentiates.",
      claim_ids: ["C13", "C14"],
      challenge_ids: ["X2", "X5"],
    },
  ],
  thesis_verdict: "weakened",
  revised_statement:
    "A real need exists, but a subscription bookkeeping tool for all SMEs is weakly supported. The opportunity is stronger for SMEs above the tax threshold, or with a model tied to getting paid or getting credit.",
  changes: [
    {
      from: "SMEs will pay a subscription large enough to sustain the business.",
      to: "Willingness to pay among micro businesses is low; revenue likely needs a different payer or a higher-value segment.",
      reason: "Direct pricing and conversion evidence contradicts the assumption, and free bundled tools anchor prices down.",
      claim_ids: ["C6", "C8", "C9"],
      challenge_ids: ["X1", "X2"],
    },
    {
      from: "Tax reforms will push a large share of SMEs to digital records.",
      to: "Tax reforms push SMEs above the turnover threshold, a narrower but more motivated segment.",
      reason: "Businesses below the threshold are exempt from most obligations.",
      claim_ids: ["C4", "C5"],
      challenge_ids: ["X3"],
    },
  ],
  unresolved: ["Whether AI categorisation differentiates or adds friction", "Whether lenders or payment providers would pay for distribution"],
};

export const MOCK_CONCLUSION = {
  final_statement:
    "An opportunity exists, but not as a broad subscription product for all SMEs. Willingness to pay and differentiation from free bundled tools need to be validated first. The best-supported entry point is compliance-ready bookkeeping for SMEs above the tax threshold, or a model where lenders or payment providers pay.",
  confidence: "medium",
  confidence_rationale:
    "The need is well evidenced, but the stress test exposed that the revenue model rests on thin, contradicting pricing evidence.",
  key_supporting_claim_ids: ["C1", "C2", "C4", "C11"],
  key_challenging_claim_ids: ["C5", "C6", "C8", "C9"],
  uncertainties: [
    "What SMEs above the tax threshold would pay",
    "Whether AI categorisation builds or erodes trust",
    "Whether lenders would pay for distribution or data partnerships",
  ],
  next_validation_steps: [
    { step: "Interview 20 SME owners above the tax threshold and test three price points.", resolves: "What SMEs above the tax threshold would pay" },
    { step: "Pitch a data partnership to two lenders running cash-flow underwriting pilots.", resolves: "Whether lenders would pay for distribution or data partnerships" },
    { step: "Run a concierge pilot where AI suggests categories and owners confirm them, and measure edit rate and retention.", resolves: "Whether AI categorisation builds or erodes trust" },
  ],
};

export const MOCK_OUTPUTS: Record<string, unknown> = {
  query_plan: MOCK_QUERY_PLAN,
  claims: MOCK_CLAIMS,
  thesis: MOCK_THESIS,
  stress_test: MOCK_STRESS_TEST,
  reevaluation: MOCK_REEVALUATION,
  conclusion: MOCK_CONCLUSION,
};
