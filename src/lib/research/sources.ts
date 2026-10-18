/**
 * Source quality, in plain code (no model calls): what kind of publisher a source is, judged
 * from its web address, and whether it's weak evidence. It's a best guess from the domain;
 * the point is to surface social posts and stale pages, not to rank publishers finely.
 */

export type SourceKind = "research" | "government" | "industry_report" | "news" | "reference" | "company_or_blog" | "social" | "mock";

export const SOURCE_KIND_LABEL: Record<SourceKind, string> = {
  research: "research",
  government: "government / official",
  industry_report: "industry report",
  news: "news",
  reference: "reference",
  company_or_blog: "company / blog",
  social: "social / forum",
  mock: "mock",
};

/** Older than this (when a date is known) is flagged as possibly out of date. */
export const STALE_AFTER_YEARS = 3;

// Matched against the hostname and its parent domains ("m.facebook.com" matches "facebook.com").
const DOMAINS: Partial<Record<SourceKind, string[]>> = {
  social: [
    "facebook.com", "fb.com", "instagram.com", "x.com", "twitter.com", "linkedin.com", "tiktok.com", "youtube.com",
    "reddit.com", "quora.com", "pinterest.com", "threads.net", "nairaland.com", "t.me", "whatsapp.com",
    "medium.com", "substack.com", "discord.com", "telegram.org", "bitcointalk.org", "stackexchange.com",
  ],
  research: [
    "researchgate.net", "academia.edu", "semanticscholar.org", "ssrn.com", "arxiv.org", "doi.org", "sciencedirect.com",
    "springer.com", "link.springer.com", "wiley.com", "tandfonline.com", "mdpi.com", "jstor.org", "ncbi.nlm.nih.gov",
    "nber.org", "scholar.google.com", "emerald.com", "sagepub.com", "frontiersin.org", "plos.org", "nature.com",
    "rsisinternational.org", "abjournals.org", "ajol.info", "iiste.org", "hbs.edu", "brookings.edu", "cambridge.org",
    "oup.com", "papers.ssrn.com", "repec.org", "ideas.repec.org", "cepr.org", "voxeu.org",
  ],
  government: [
    "worldbank.org", "imf.org", "oecd.org", "un.org", "undp.org", "who.int", "afdb.org", "wto.org", "ilo.org", "bis.org",
    "europa.eu", "cbn.gov.ng", "nigerianstat.gov.ng", "fca.org.uk", "bankofengland.co.uk", "federalreserve.gov",
    "ecb.europa.eu", "esma.europa.eu", "fsb.org", "iosco.org", "fatf-gafi.org", "sec.gov.ng", "cbk.go.ke", "resbank.co.za",
    "bog.gov.gh", "centralbank.ie", "mas.gov.sg", "fincen.gov", "fedsmallbusiness.org", "federalreserve.org", "sba.gov",
  ],
  industry_report: [
    "mordorintelligence.com", "6wresearch.com", "statista.com", "grandviewresearch.com", "marketsandmarkets.com",
    "imarcgroup.com", "fortunebusinessinsights.com", "researchandmarkets.com", "alliedmarketresearch.com", "gartner.com",
    "forrester.com", "idc.com", "mckinsey.com", "bcg.com", "pwc.com", "deloitte.com", "kpmg.com", "ey.com",
    "accenture.com", "bain.com", "tracxn.com", "crunchbase.com", "cbinsights.com", "agustoresearch.com", "gsma.com",
    // Crypto, payments and fintech research
    "chainalysis.com", "messari.io", "kaiko.com", "glassnode.com", "coinmetrics.io", "dune.com", "defillama.com",
    "galaxy.com", "a16zcrypto.com", "electriccapital.com", "juniperresearch.com", "mckinsey.de", "worldpay.com",
    "fisglobal.com", "capgemini.com", "emarketer.com", "insiderintelligence.com", "pewresearch.org", "morningconsult.com",
    "yougov.com", "ipsos.com", "nielsen.com", "similarweb.com", "credenceresearch.com", "uschamber.com", "nfib.com",
    "businessresearchinsights.com", "verifiedmarketresearch.com", "precedenceresearch.com", "coherentmarketinsights.com",
  ],
  news: [
    "reuters.com", "bloomberg.com", "ft.com", "wsj.com", "nytimes.com", "bbc.com", "bbc.co.uk", "theguardian.com",
    "cnbc.com", "forbes.com", "economist.com", "apnews.com", "aljazeera.com", "techcrunch.com", "theverge.com",
    "wired.com", "businessinsider.com", "techcabal.com", "techpoint.africa", "punchng.com", "guardian.ng",
    "vanguardngr.com", "premiumtimesng.com", "thecable.ng", "businessday.ng", "nairametrics.com", "channelstv.com",
    "thisdaylive.com", "dailytrust.com", "leadership.ng", "tribuneonlineng.com", "africanews.com", "qz.com",
    "axios.com", "fortune.com", "cnn.com", "npr.org", "washingtonpost.com", "usatoday.com", "time.com", "theatlantic.com",
    "hbr.org", "fastcompany.com", "inc.com", "entrepreneur.com", "venturebeat.com", "zdnet.com", "arstechnica.com",
    "restofworld.org", "semafor.com", "marketwatch.com", "barrons.com", "investing.com", "yahoo.com", "finance.yahoo.com",
    // Crypto, payments and fintech news
    "coindesk.com", "cointelegraph.com", "theblock.co", "decrypt.co", "blockworks.co", "bitcoinmagazine.com",
    "cryptoslate.com", "cryptonews.com", "dlnews.com", "thedefiant.io", "coinjournal.net", "beincrypto.com",
    "pymnts.com", "finextra.com", "americanbanker.com", "paymentsdive.com", "paymentscardsandmobile.com", "thefintechtimes.com",
    "fintechfutures.com", "tearsheet.co", "techcentral.co.za", "disrupt-africa.com", "weetracker.com", "iol.co.za",
    "nation.africa", "businessdailyafrica.com", "myjoyonline.com", "citinewsroom.com", "aba.com", "tradingview.com",
    "paymentsjournal.com", "digitaltransactions.net", "bankrate.com",
  ],
  reference: ["wikipedia.org", "britannica.com", "investopedia.com", "corporatefinanceinstitute.com", "nerdwallet.com", "coinmarketcap.com", "coingecko.com"],
};

/** Publishers of original data: studies, official statistics and industry research. */
export const PRIMARY_DOMAINS: readonly string[] = [...DOMAINS.research!, ...DOMAINS.government!, ...DOMAINS.industry_report!];

/**
 * How much a source's type is worth as evidence, best first. Unrecognised sites count as
 * company or blog here, since SERV only labels them after they're picked.
 */
export function sourceRank(kind: SourceKind): number {
  if (kind === "research" || kind === "government" || kind === "industry_report") return 0;
  if (kind === "news" || kind === "reference") return 1;
  return 2;
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

const matches = (host: string, domain: string) => host === domain || host.endsWith(`.${domain}`);

/** The source's type when its address is recognised, or null when it isn't (then SERV's label decides). */
export function knownKind(url: string): SourceKind | null {
  const host = hostOf(url);
  if (!host) return null;
  if (host === "example.org" || host.endsWith(".example.org")) return "mock";
  for (const kind of ["social", "research", "government", "industry_report", "news", "reference"] as const) {
    if (DOMAINS[kind]!.some((d) => matches(host, d))) return kind;
  }
  // Public-sector and academic suffixes, including country forms like .gov.ng, .edu.ng, .ac.uk.
  if (/(^|\.)(gov|gouv|gob|mil)(\.[a-z]{2})?$/.test(host) || host.endsWith(".int")) return "government";
  if (/(^|\.)(edu|ac)(\.[a-z]{2})?$/.test(host) || /^(ir|repository|eprints|scholar|journals?)\./.test(host)) return "research";
  if (/(^|\.)(news|times|herald|tribune|gazette|post|guardian)\b/.test(host)) return "news";
  return null;
}

export function classifySource(url: string): SourceKind {
  return knownKind(url) ?? "company_or_blog";
}

/** Kinds SERV may assign to a source it reads (never "mock": that's only for fixtures). */
export const SERV_SOURCE_KINDS = ["research", "government", "industry_report", "news", "reference", "company_or_blog", "social"] as const;

/** Why a source is weak evidence, if it is: user-generated content, or out of date. */
export function sourceFlags(kind: SourceKind, publishedDate: string | null, now = new Date()): string[] {
  const flags: string[] = [];
  if (kind === "social") flags.push("user-generated, unverified");
  if (publishedDate) {
    const published = new Date(publishedDate);
    const cutoff = new Date(now);
    cutoff.setFullYear(cutoff.getFullYear() - STALE_AFTER_YEARS);
    if (!Number.isNaN(published.getTime()) && published < cutoff) flags.push(`published ${published.getFullYear()}, may be out of date`);
  }
  return flags;
}
