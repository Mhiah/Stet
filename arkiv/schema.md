# Stet on Arkiv: schema

Network: **Tiramisu testnet**, chain ID `7738577`. SDK: `@arkiv-network/sdk` 0.8.1.
Writer wallet (`$creator` of every run and fact): `0x441aB97848BB539187D93EF3eF7125D1FbABbf27`.
Code: [`src/lib/arkiv/`](../src/lib/arkiv) (`record.ts` builds and hashes payloads, `runs.ts` reads and writes, `backend.ts` wraps the SDK).

Stet writes three kinds of entity. Every one carries `app = "stet"` and a `kind`, so the whole data set can be rebuilt by anyone with one query, without Stet's server.

All Stet entities are created with the creation flags **`readonly: true`** (payload and attributes can never change) and **`permissionlessExtension: true`** (anyone, not just the writer, can extend the expiry; `npm run extend` does this from any wallet).

**Expiration per type:** runs, facts and challenges are all created with `ExpirationTime.fromDays(ARKIV_TTL_DAYS)`, default **365 days**. A brief and its facts share one lifetime and are extended together. Challenges get the same lifetime so dissent doesn't expire before the brief it answers.

## 1. Run (`kind = "run"`)

One entity per finished research brief. Written by Stet's server wallet.

**Payload** (`application/json`, schema `stet.run/1`): the whole brief as canonical JSON (object keys sorted at every level, so the same brief always gives the same bytes): question, sources, facts with their verified quotes, thesis, stress test, re-evaluation, conclusion, what changed, and the audit trail. Two things are reduced to fit one entity (128 KiB limit, Stet stays under 120 KiB):

- Source excerpts are cut to 1,200 characters; `excerpt_sha256` keeps the hash of the full excerpt.
- Each audit-trail entry keeps its stage, model, timing, inputs and warnings, but its `output` (a duplicate of the stage result already in the brief) is replaced by that output's SHA-256.

The payload also carries `supersedes` (the run this one revises, or `null`) and `lineage` (the first run in the line of revisions).

| Attribute | Type | Purpose |
| --- | --- | --- |
| `app` | str | `"stet"` |
| `kind` | str | `"run"` |
| `schema` | str | `"stet.run/1"` |
| `run_id` | str | The run's UUID, used in URLs (`/research/:run_id`) |
| `lineage` | str | Groups an original and its revisions |
| `supersedes` | str | Only on revisions: the run id this one revises |
| `content_sha256` | bytes32 | SHA-256 of the exact payload bytes. The tamper check compares against this |
| `status` | str | `complete` or `failed` |
| `mode` | str | `live` (real research) or `mock` (sample data) |
| `confidence` | str | Final confidence: `low`, `medium`, `high` |
| `verdict` | str | What the stress test did to the first answer: `strengthened`, `survived`, `weakened`, `overturned` |
| `fact_count` | i32 | Number of verified facts |
| `created_ms` | u64 | When the run started, Unix ms |

## 2. Fact (`kind = "fact"`)

One entity per verified fact in a run, written in a second transaction right after the run (the run's key is only known once it exists).

**Payload** (`stet.fact/1`): the fact's text, stance, category, the exact quotes it rests on, any figures its quotes don't contain, and its sources (URL, title, publisher, excerpt hash).

| Attribute | Type | Purpose |
| --- | --- | --- |
| `app`, `kind` | str | `"stet"`, `"fact"` |
| `run_id` | str | The run it belongs to |
| `run` | key | The run entity's key |
| `claim_id` | str | `C1`, `C2`, … as cited in the brief |
| `stance` | str | `supports`, `challenges`, `neutral` relative to the question |
| `category` | str | `market_demand`, `pricing`, `regulation`, … |
| `quote_checked` | bool | `true` when every figure in the fact appears in its quotes |

Facts are their own entities so they can be queried across runs, for example every challenging fact on regulation: `app = "stet" && kind = "fact" && stance = "challenges" && category = "regulation"`.

## 3. Challenge (`kind = "challenge"`)

A counter-claim against a run, written by **anyone from their own wallet** (`npm run challenge`). Stet's UI finds challenges by `run_id`, not by owner, and shows the owner's address and whether it is a different wallet from the one that wrote the run.

**Payload** (`stet.challenge/1`): `text` (10 to 2,000 characters), `target`, `evidence_url`.

| Attribute | Type | Purpose |
| --- | --- | --- |
| `app`, `kind` | str | `"stet"`, `"challenge"` |
| `run_id` | str | The run challenged |
| `target` | str | A fact id (`C3`), an assumption id (`A2`) or `conclusion` |

## Queries Stet runs

| Where | Query | Notes |
| --- | --- | --- |
| Reopen a run (`/research/:id`) | `app = str('stet') AND kind = str('run') AND run_id = str(<id>) AND $creator = addr(<writer>)` | Trust is checked against `$creator`, which can never change, inside the query. A run with the same id written by anyone else is never returned, even if its ownership is later transferred to Stet's wallet |
| Runs list (`/runs`) | `app = str('stet') AND kind = str('run') AND $creator = addr(<writer>)` | Sorted by `created_at` in the app (the query builder has no ordering) |
| Revisions | `app = str('stet') AND kind = str('run') AND lineage = str(<id>) AND $creator = addr(<writer>)` | |
| Keep alive (`npm run extend`) | the run and `kind = str('fact') AND run_id = str(<id>) AND $creator = addr(<writer>)` | Then one `executeBatch` of `extensions`, signed by any wallet |
| Challenges | `app = str('stet') AND kind = str('challenge') AND run_id = str(<id>)` | **Not** filtered by creator, on purpose. Each is marked independent when its `$creator` differs from the run's |
| Verify (`/verify`) | by `run_id` as above, or `getEntity(key)` | Recomputes SHA-256 of the payload and compares to `content_sha256`, then to the canonical hash of any copy given |

## Kept off Arkiv on purpose

- **Full source pages and excerpts beyond 1,200 characters.** Third-party text; only what the brief needs, plus a hash of the rest.
- **Private keys, API keys, secrets.** Never stored, hashed or otherwise.
- **Personal data.** Stet researches public market questions from public web sources. Use synthetic or public questions only; don't put personal information in a question or challenge.
- **The PDF.** It's rendered in the browser from the run; its footer prints the entity key and hash so a paper copy can be checked.
- **SERV and Tavily request logs.** Only the recorded results are published.
