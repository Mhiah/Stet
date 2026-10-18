import { Document, Font, Link, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";
import type { ReactNode } from "react";
import { factCheckSummary, recordIds, stripRefs } from "@/lib/plain";
import { SOURCE_KIND_LABEL } from "@/lib/research/sources";
import type { AssumptionVerdict, Challenge, Confidence, ResearchProject } from "@/lib/types";

/**
 * The downloadable report, built as a real PDF in the browser (selectable text, no print
 * dialog). Same order as the app: the answer and what changed, then the reasoning, then
 * the evidence as an appendix. Loaded on demand, so react-pdf never weighs on the page.
 *
 * Inter is embedded because the PDF standard fonts have no ₦ (and reports quote naira).
 */

let fontsFor: string | null = null;
function registerFonts(base: string) {
  if (fontsFor === base) return;
  Font.register({
    family: "Inter",
    fonts: [
      { src: `${base}/Inter-Regular.ttf`, fontWeight: 400 },
      { src: `${base}/Inter-SemiBold.ttf`, fontWeight: 600 },
    ],
  });
  Font.registerHyphenationCallback((word) => [word]); // no mid-word hyphens
  fontsFor = base;
}

const C = {
  text: "#171717",
  muted: "#5b5b5b",
  line: "#e3e3e0",
  surface: "#f7f7f6",
  good: ["#15803d", "#dcfce7"],
  warn: ["#a16207", "#fef3c7"],
  bad: ["#b91c1c", "#fee2e2"],
  neutral: ["#5b5b5b", "#efefed"],
  info: "#1d4ed8",
} as const;

type Tone = "good" | "warn" | "bad" | "neutral";
const CONFIDENCE_TONE: Record<Confidence, Tone> = { high: "good", medium: "warn", low: "bad" };
const VERDICT_TONE: Record<AssumptionVerdict, Tone> = { supported: "good", weakened: "warn", contradicted: "bad", unresolved: "neutral" };
const THESIS_TONE = { strengthened: "good", survived: "good", weakened: "warn", overturned: "bad" } as const;
const SEVERITY_TONE: Record<Challenge["severity"], Tone> = { minor: "neutral", major: "warn", critical: "bad" };
const SEVERITY_ORDER = { critical: 0, major: 1, minor: 2 };

const s = StyleSheet.create({
  page: { paddingTop: 44, paddingBottom: 56, paddingHorizontal: 44, fontFamily: "Inter", fontSize: 9.5, lineHeight: 1.5, color: C.text },
  eyebrow: { fontSize: 8, fontWeight: 600, letterSpacing: 1, color: C.muted, textTransform: "uppercase" },
  title: { fontSize: 18, fontWeight: 600, lineHeight: 1.25, marginTop: 6 },
  meta: { fontSize: 8.5, color: C.muted, marginTop: 4 },
  h2: { fontSize: 13, fontWeight: 600, marginTop: 22, marginBottom: 8 },
  h3: { fontSize: 10, fontWeight: 600, marginBottom: 5 },
  muted: { color: C.muted },
  answer: { fontSize: 13, fontWeight: 600, lineHeight: 1.4, marginTop: 8 },
  card: { borderWidth: 1, borderColor: C.line, borderRadius: 6, padding: 10, marginBottom: 7 },
  row: { flexDirection: "row", gap: 8 },
  col: { flex: 1 },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: 4, alignItems: "center" },
  pill: { fontSize: 7.5, fontWeight: 600, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  small: { fontSize: 8, color: C.muted },
  bullet: { flexDirection: "row", marginBottom: 3 },
  bulletMark: { width: 12, color: C.muted },
  quote: { borderLeftWidth: 2, borderLeftColor: C.line, paddingLeft: 7, marginTop: 4, color: C.muted },
  footer: { position: "absolute", bottom: 24, left: 44, right: 44, fontSize: 7.5, color: C.muted },
});

function Pill({ tone, children }: { tone: Tone; children: ReactNode }) {
  const [fg, bg] = C[tone];
  return <Text style={[s.pill, { color: fg, backgroundColor: bg }]}>{children}</Text>;
}

/** A heading that always travels to the next page with its first item, never alone at a page's foot. */
function Group({ heading, children }: { heading: ReactNode; children: ReactNode[] }) {
  const [first, ...rest] = children;
  return (
    <View>
      <View wrap={false}>
        {heading}
        {first}
      </View>
      {rest}
    </View>
  );
}

const H2 = ({ children }: { children: ReactNode }) => <Text style={s.h2}>{children}</Text>;

function bullets(items: ReactNode[], numbered = false): ReactNode[] {
  return items.map((item, i) => (
    <View key={i} style={s.bullet} wrap={false}>
      <Text style={s.bulletMark}>{numbered ? `${i + 1}.` : "•"}</Text>
      <View style={s.col}>{typeof item === "string" ? <Text>{item}</Text> : item}</View>
    </View>
  ));
}

function Card({ children }: { children: ReactNode }) {
  return (
    <View style={s.card} wrap={false}>
      {children}
    </View>
  );
}

const human = (t: string) => t.replace(/_/g, " ");
const date = (iso: string) =>
  `${new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC`;

export function ReportDocument({ project }: { project: ResearchProject }) {
  const known = recordIds(project);
  const plain = (text: string) => stripRefs(text, known);
  const { thesis: t, stress_test: st, reevaluation: re, conclusion: c, what_changed: wc, research: r } = project;
  const assumptionText = (id: string) => plain(t?.assumptions.find((a) => a.id === id)?.text ?? "");
  const sourceNumber = new Map(r?.sources.map((src, i) => [src.id, i + 1]));
  const footer = <Footer question={project.question} />;

  return (
    <Document title={`Crux: ${project.question}`} author="Crux" subject="Research report">
      <Page size="A4" style={s.page}>
        {footer}
        <Text style={s.eyebrow}>Crux research report</Text>
        <Text style={s.title}>{project.question}</Text>
        <Text style={s.meta}>
          {date(project.created_at)}
          {project.mode === "mock" ? ` · ${project.notice ?? "Mock run: illustrative sample data, not real research"}` : ""}
        </Text>

        {c && (
          <View style={{ marginTop: 18, backgroundColor: C.surface, borderRadius: 8, padding: 14 }}>
            <View style={s.pills}>
              <Pill tone={CONFIDENCE_TONE[c.confidence]}>{c.confidence} confidence</Pill>
              {re && <Pill tone={THESIS_TONE[re.thesis_verdict]}>thesis {re.thesis_verdict} by the stress test</Pill>}
            </View>
            <Text style={s.answer}>{plain(c.final_statement)}</Text>
            <Text style={[s.muted, { marginTop: 6 }]}>{plain(c.confidence_rationale)}</Text>
          </View>
        )}

        {wc && (
          <Group heading={<H2>What changed?</H2>}>
            {[
              <View key="compare" style={s.row}>
                <View style={[s.card, s.col]}>
                  <Text style={[s.h3, s.muted]}>First answer · {wc.initial.confidence} confidence</Text>
                  <Text style={s.muted}>{plain(wc.initial.statement)}</Text>
                </View>
                <View style={[s.card, s.col, { borderColor: "#bdbdb8" }]}>
                  <Text style={s.h3}>After the stress test · {wc.final.confidence} confidence</Text>
                  <Text>{plain(wc.final.statement)}</Text>
                </View>
              </View>,
              wc.changes.length === 0 ? (
                <Text key="none" style={s.muted}>
                  The thesis survived the stress test without material changes.
                </Text>
              ) : (
                <Group key="why" heading={<Text style={[s.h3, { marginTop: 8 }]}>Why it changed</Text>}>
                  {wc.changes.map((ch, i) => (
                    <Card key={i}>
                      <Text style={[s.muted, { textDecoration: "line-through" }]}>{plain(ch.from)}</Text>
                      <Text style={{ fontWeight: 600, marginTop: 2 }}>→ {plain(ch.to)}</Text>
                      <Text style={[s.muted, { marginTop: 3 }]}>{plain(ch.reason)}</Text>
                    </Card>
                  ))}
                </Group>
              ),
            ]}
          </Group>
        )}

        {c && (
          <>
            <Group heading={<H2>Next steps to validate</H2>}>
              {bullets(
                c.next_validation_steps.map((step, i) => (
                  <View key={i}>
                    <Text>{plain(step.step)}</Text>
                    <Text style={s.small}>Settles: {plain(step.resolves)}</Text>
                  </View>
                )),
                true,
              )}
            </Group>
            <Group heading={<H2>Still uncertain</H2>}>{bullets(c.uncertainties.map(plain))}</Group>
          </>
        )}
      </Page>

      {t && (
        <Page size="A4" style={s.page}>
          {footer}
          <Text style={s.eyebrow}>Reasoning</Text>
          <H2>The first answer · {t.confidence} confidence</H2>
          <Text>{plain(t.statement)}</Text>
          <Text style={[s.muted, { marginTop: 5 }]}>{plain(t.confidence_rationale)}</Text>

          {st && (
            <Group heading={<H2>Stress test</H2>}>
              {[...st.challenges]
                .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
                .map((x) => (
                  <Card key={x.id}>
                    <View style={s.pills}>
                      <Pill tone={SEVERITY_TONE[x.severity]}>{x.severity}</Pill>
                      <Text style={s.small}>{human(x.kind)}</Text>
                    </View>
                    <Text style={{ marginTop: 4 }}>{plain(x.text)}</Text>
                    {x.target_assumption_ids.length > 0 && (
                      <Text style={[s.small, { marginTop: 3 }]}>
                        Challenges: {x.target_assumption_ids.map((id) => `“${assumptionText(id)}”`).join(" · ")}
                      </Text>
                    )}
                  </Card>
                ))}
            </Group>
          )}

          <Group heading={<H2>Assumptions{re ? ", re-judged after the stress test" : ""}</H2>}>
            {t.assumptions.map((a) => {
              const v = re?.assessments.find((x) => x.assumption_id === a.id);
              return (
                <Card key={a.id}>
                  <View style={[s.row, { alignItems: "flex-start" }]}>
                    <Text style={[s.col, { fontWeight: 600 }]}>{plain(a.text)}</Text>
                    {v && <Pill tone={VERDICT_TONE[v.verdict]}>{v.verdict}</Pill>}
                  </View>
                  {v && <Text style={[s.muted, { marginTop: 4 }]}>{plain(v.reasoning)}</Text>}
                </Card>
              );
            })}
          </Group>

          {st && st.failure_conditions.length > 0 && (
            <Group heading={<H2>The answer fails if…</H2>}>{bullets(st.failure_conditions.map(plain))}</Group>
          )}
          {st && st.missing_evidence.length > 0 && (
            <Group heading={<H2>Missing evidence</H2>}>
              {bullets(
                st.missing_evidence.map((m, i) => (
                  <View key={i}>
                    <Text>{plain(m.question)}</Text>
                    <Text style={s.small}>{plain(m.why_it_matters)}</Text>
                  </View>
                )),
              )}
            </Group>
          )}
          {re && re.unresolved.length > 0 && (
            <Group heading={<H2>What the evidence can&apos;t settle</H2>}>{bullets(re.unresolved.map(plain))}</Group>
          )}
        </Page>
      )}

      {r && (
        <Page size="A4" style={s.page}>
          {footer}
          <Text style={s.eyebrow}>Appendix</Text>
          <H2>
            Evidence · {r.claims.length} facts from {r.sources.length} sources
          </H2>
          {r.fact_check && (
            <Text style={[s.muted, { marginBottom: 8 }]}>
              Fact-checked: each fact is matched to the exact words in its source.{" "}
              {factCheckSummary(r.fact_check)}
            </Text>
          )}
          {r.claims.map((claim) => (
            <Card key={claim.id}>
              <Text style={{ fontWeight: 600 }}>{plain(claim.text)}</Text>
              {(claim.quotes ?? []).map((q, i) => (
                <Text key={i} style={s.quote}>
                  “{q.text}” (source {sourceNumber.get(q.source_id) ?? "?"})
                </Text>
              ))}
              <Text style={[s.small, { marginTop: 4 }]}>
                {claim.stance === "supports" ? "For" : claim.stance === "challenges" ? "Against" : "Neutral"} · {human(claim.category)}
                {!claim.quotes ? ` · sources ${claim.source_ids.map((id) => sourceNumber.get(id)).join(", ")}` : ""}
                {claim.unmatched_numbers?.length ? ` · figures not in source: ${claim.unmatched_numbers.join(", ")}` : ""}
              </Text>
            </Card>
          ))}

          <Group heading={<H2>Sources</H2>}>
            {r.sources.map((src, i) => (
              <View key={src.id} style={s.bullet} wrap={false}>
                <Text style={s.bulletMark}>{i + 1}.</Text>
                <View style={s.col}>
                  <Text style={{ fontWeight: 600 }}>{src.title}</Text>
                  <Text style={s.small}>
                    {[src.publisher, src.kind && SOURCE_KIND_LABEL[src.kind], src.published_date, ...(src.flags ?? [])].filter(Boolean).join(" · ")}
                  </Text>
                  <Link src={src.url} style={{ fontSize: 7.5, color: C.info }}>
                    {src.url}
                  </Link>
                </View>
              </View>
            ))}
          </Group>
        </Page>
      )}
    </Document>
  );
}

/** On every page. (No page numbers: react-pdf's dynamic `render` text doesn't draw here.) */
function Footer({ question }: { question: string }) {
  return (
    <Text style={s.footer} fixed>
      Crux · {question.length > 90 ? `${question.slice(0, 87)}…` : question}
    </Text>
  );
}

/** Builds the PDF. `fontBase` is where the Inter files are served (public/fonts in the app). */
export async function reportPdfBlob(project: ResearchProject, fontBase = "/fonts"): Promise<Blob> {
  registerFonts(fontBase);
  return pdf(<ReportDocument project={project} />).toBlob();
}
