# Stet

**Research briefs that can't be quietly rewritten or removed.**

In proofreading, *stet* means "let it stand". Stet is an AI research engine that forms a thesis on a
market or strategy question, stress tests it against the evidence, and publishes the whole brief to
[Arkiv](https://arkiv.network): every fact with the exact source words it rests on, the challenges,
the verdicts, and what changed. Once published, the brief can't be edited by anyone, including Stet.
Anyone can verify a copy against it, keep it alive, or file a challenge against it from their own
wallet.

Built for **Arkiv: Global Tour Stop** (9 to 18 October 2026). Tracks: **Security** and
**Censorship Resistance**.

- **Live app:** _add your deployment URL_
- **Writer wallet (creates Stet's run and fact entities on Tiramisu):** [`0x441aB97848BB539187D93EF3eF7125D1FbABbf27`](https://tiramisu.explorer.arkiv.network/address/0x441aB97848BB539187D93EF3eF7125D1FbABbf27)
- **Schema:** [arkiv/schema.md](arkiv/schema.md) · **Friction report:** [arkiv/friction.md](arkiv/friction.md)

## Why this pillar?

**Security: who is harmed if this data is forged?** Research briefs drive decisions: whether to fund
a project, enter a market, back a governance proposal. A brief passed around as a PDF or a database
row can be edited after the fact: a confidence quietly raised, a damaging fact removed, a quote
reworded. The reader who acts on the edited copy is harmed, and so is the analyst whose name is on
it. Stet makes every published brief checkable: its SHA-256 is recorded on Arkiv beside a read-only
copy, and `/verify` names exactly which fields of a copy were changed.

**Censorship resistance: who is harmed if it's taken down?** Scrutiny is what gets deleted first.
A brief that weakens a project's claims, or a counter-claim against a brief, can disappear when the
operator who hosts it is pressured, sold or shut down. On Stet, a brief survives without Stet: it
lives on Arkiv as a read-only entity anyone can read and re-render, anyone can extend its life
(`permissionlessExtension`), and challenges are written from the challenger's own wallet, so Stet
has no way to remove them. Revisions never overwrite: they're new runs that point back to the
original, which stays on Arkiv unchanged.

## Why Arkiv?

| If Stet used… | What would break |
| --- | --- |
| **Postgres** | The operator can `UPDATE` or `DELETE` any brief or challenge, and readers can't tell. A tamper check against a hash Stet also controls proves nothing. |
| **IPFS** | Content addressing gives integrity, but nothing is queryable: no "every challenge on run X", no "every challenging fact on regulation", no revisions by lineage. Pinning is someone's job, and when they stop, the brief goes. |
| **A subgraph** | Indexes events, but the brief has to live somewhere else, and Stet would need a contract to emit them. |
| **Its own API** | Everything above, plus the brief dies with the server. |

Arkiv gives what a brief needs in one place: the document itself as a payload, queryable
attributes, read-only entities, an owner address on every entity (so whose challenge is whose is
public), and expiry that anyone can extend.

**Kept off Arkiv on purpose:** full source pages (only short excerpts plus a hash of the rest),
API keys and secrets, personal data, the PDF, and SERV/Tavily request logs. See
[arkiv/schema.md](arkiv/schema.md#kept-off-arkiv-on-purpose).

## How Stet uses Arkiv

| Feature | How and why |
| --- | --- |
| **Entities with JSON payloads** | One `run` entity holds the whole brief as canonical JSON. One `fact` entity per verified fact, so facts can be queried across briefs. |
| **Typed attributes** | `bytes32` for `content_sha256`, `key` to link each fact to its run, `u64` timestamp, `i32` fact count, strings for everything Stet filters on. |
| **Queries** | Reopen a brief by `run_id`, list runs, list a brief's revisions by `lineage`, list challenges by `run_id`. Runs are filtered to Stet's writer wallet so nobody can publish a fake brief under a real id; challenges deliberately aren't. |
| **`readonly` creation flag** | Every Stet entity is immutable. This is what makes "can't be quietly rewritten" true at the data layer, not a promise. |
| **`permissionlessExtension` flag** | Anyone can keep a brief alive past its expiry without being able to change it. |
| **Owner addresses** | Challenges from other wallets are marked as independent in the UI. |
| **`executeBatch`** | All of a brief's facts are written in one transaction. |
| **Expiry** | Briefs live `ARKIV_TTL_DAYS` (default 365), extendable by anyone. |

Reading needs no key: `/research/:id`, `/runs` and `/verify` read straight from Tiramisu.

## Try it

1. Ask a question (press → to fill in the demo question) and choose **Research and publish**. The
   brief fills in stage by stage, then is published to Arkiv.
2. Open **Published to Arkiv**. The **On Arkiv** panel shows the entity, its hash and whether the
   stored brief still matches it.
3. **Download record**, change one word in it, and paste it into **Verify a copy**. Stet names the
   field you changed.
4. File a challenge from your own wallet (below) and reload the brief: it appears with your address,
   marked as an independent wallet.
5. **Re-run as a revision**: a new brief is published and linked; the original stays exactly as it was.

### File a challenge

```bash
CHALLENGER_PRIVATE_KEY=0x… npm run challenge -- \
  --run <run id> --target C3 \
  --text "This figure is from 2019, not 2025" \
  --url https://link-to-evidence
```

Use a funded Tiramisu testnet wallet and public or synthetic information only.

## Run it locally

Node.js 22 or newer.

```bash
git clone https://github.com/Mhiah/Stet.git
cd Stet
npm install
cp .env.example .env.local   # add ARKIV_PRIVATE_KEY, and SERV_API_KEY / TAVILY_API_KEY for live research
npm run arkiv:check          # publishes a sample brief to Tiramisu and checks the round trip
npm run dev                  # http://localhost:3000
```

| Variable | Purpose |
| --- | --- |
| `ARKIV_PRIVATE_KEY` | A funded Tiramisu wallet that publishes briefs. Never commit it. Reading works without it |
| `ARKIV_TTL_DAYS` | How long briefs live before someone extends them (default 365) |
| `SERV_API_KEY` | SERV Reasoning for the reasoning stages. Without it, research uses sample data |
| `TAVILY_API_KEY` | Web search. Without it, research uses sample sources |
| `STET_MOCK` | `1` forces sample research (still published to Arkiv) |
| `STET_ARKIV_MEMORY` | `1` uses an in-memory stand-in for Arkiv (offline development only; nothing is published) |

**Network:** Tiramisu, chain ID `7738577`, RPC `https://rpc.tiramisu.db-chain.testnet.arkiv.network`,
explorer [tiramisu.explorer.arkiv.network](https://tiramisu.explorer.arkiv.network).

Other commands: `npm test` (unit tests, including the Arkiv layer against an in-memory stand-in),
`npm run typecheck`, `npm run lint`, `npm run build`.

### Deploy on Vercel

Import the repo, add `ARKIV_PRIVATE_KEY`, `SERV_API_KEY` and `TAVILY_API_KEY` under
**Settings → Environment Variables**, and redeploy. `/api/status` shows which are set (never their
values) and the writer wallet address.

## How the research works

Each brief goes through six stages, each recorded in an audit trail: research (search plan with
searches for and against, source selection, fact extraction with every quote checked against its
source text), thesis, stress test, re-evaluation of every assumption, conclusion, and what changed.
Reasoning runs on SERV Reasoning with strict JSON schemas; search on Tavily.

## Code

```
src/lib/arkiv/
  record.ts     Canonical JSON, hashing, the run and fact records, copy diffing
  runs.ts       Publish, reopen, list, revise, verify, challenges
  backend.ts    The Arkiv SDK client (Tiramisu) and the in-memory stand-in
src/lib/store.ts                Arkiv as the app's store
src/app/research/[id]/page.tsx  A brief, read from Arkiv, with the On Arkiv panel
src/app/runs, src/app/verify    Runs list and tamper check
src/app/api/                    research (POST, streams), runs, verify, record, challenges, status
scripts/challenge.ts            File a challenge from your own wallet
scripts/arkiv-check.ts          Live round trip on Tiramisu
arkiv/schema.md, arkiv/friction.md
```

## Pre-existing work

Stet's research pipeline (search, fact checking, the SERV reasoning stages, the report UI and PDF)
is reused from an earlier project by the same author, imported unchanged as this repository's first
commit:

- **Baseline:** [Mhiah/crux@03fca1d](https://github.com/Mhiah/crux/commit/03fca1daebe306c4802decb79a5a899866dbd9d4)
  (27 September 2026), imported as commit `c6bb78b` here.
- **Reused:** `src/lib/research/`, `src/lib/reasoning/`, `src/lib/pipeline.ts`, `src/lib/mock/`,
  the report views (`workstation.tsx`, `refs.tsx`, `report-pdf.tsx`) and their tests.
- **New, built 18 October 2026:** everything on Arkiv (`src/lib/arkiv/`, the Arkiv store, the
  run/verify/record/challenge routes, the On Arkiv panel, `/runs`, `/verify`, revisions,
  challenges, both scripts, `arkiv/`), the Stet name and wordmark, and changes to the pipeline and
  pages to publish to and read from Arkiv. `git diff c6bb78b` shows all of it.

## License

[MIT](LICENSE)
