# Building Stet on Arkiv: friction report

Specific things that slowed this build down, each with how to reproduce it and what would have
helped. SDK `@arkiv-network/sdk` 0.8.1, viem 2.57.7, Node 22, Next.js 16, Tiramisu testnet.

## 1. Creation flags are only discoverable from the source

**What happened.** The two flags Stet's whole censorship-resistance story rests on, `readonly`
(payload and attributes can never change) and `permissionlessExtension` (anyone can extend the
expiry), aren't in the SDK README. I found them by reading `src/entity/flags.ts` and the JSDoc
example in `src/actions/wallet/createEntity.ts`.

**Reproduce.** Search the package README (`node_modules/@arkiv-network/sdk/README.md`) for
`readonly` or `permissionless`: no results.

**Would help.** A README section on creation flags, including that they are fixed for an entity's
whole life and how to read them back (`select({ creationFlags: true })`).

## 2. No ordering in the query builder

**What happened.** `SelectQueryBuilder` has `where`, `ownedBy`, `createdBy`, `limit`, `cursor` and
`atBlock`, but nothing to order by. To show "newest runs first", Stet fetches up to 200 and sorts in
the app by a timestamp in the payload. Past 200 runs, the list would no longer be the newest 200.

**Reproduce.** `grep -n "^  [a-zA-Z]*(" node_modules/@arkiv-network/sdk/src/query/queryBuilder.ts`.
`MAX_LIMIT` is 200 (`src/query/engine.ts`).

**Would help.** `orderBy(attribute, "asc" | "desc")` on a numeric attribute such as a `u64`
timestamp, or ordering by `createdAt` block.

## 3. Referencing an entity created in the same batch

**What happened.** Each fact entity carries a `key` attribute pointing at its run. The run's key is
only returned after the transaction lands, so Stet writes the run, waits, then writes the facts in a
second transaction. The SDK does export `predictEntityKey` (`src/entity/key.ts`), which could let
both go in one batch, but it needs the owner's current nonce and an explicit salt, and the README
doesn't mention it.

**Reproduce.** `executeBatch({ creates })` returns `createdEntities` only after the receipt; there is
no documented way to use one create's key as another create's attribute in the same call.

**Would help.** A documented pattern (or a helper) for linking entities created in one batch, for
example placeholders resolved by the SDK, or a README example of `predictEntityKey` with
`executeBatch`.

## 4. The 128-byte limit on string attributes is by bytes, and only enforced on write

**What happened.** `MAX_STRING_BYTES = 128` (`src/attr/values.ts`). A UTF-8 string of 128
*characters* can be well over 128 bytes, and the error only appears when the write is sent. Stet
now truncates attribute strings by bytes before writing.

**Reproduce.** `str("é".repeat(100))` is 200 bytes and throws `InvalidValueError`.

**Would help.** Put the limit (in bytes) in the README's attribute section next to the type
constructors.

## 5. Fitting a document in one entity

**What happened.** A full research brief with 20 source excerpts can exceed the 128 KiB payload
limit (`MAX_PAYLOAD_BYTES`, `src/attr/attributes.ts`). Stet trims excerpts to 1,200 characters and
stores a hash of each full excerpt, and keeps each audit entry's output as a hash.

**Would help.** Guidance on large documents: whether to split across entities, link them, or
compress (the SDK has `src/utils/compression.ts`, but it isn't documented for payloads).

## 6. Docs and README version drift

- The README's install example shows `"@arkiv-network/sdk": "^0.6.0"` in the resulting
  `package.json`, while the hackathon requires 0.8.x and npm installs 0.8.1.
- `https://docs.arkiv.network/networks/tiramisu/` returned a server error when fetched on
  18 October 2026 during this build, so chain details came from the hackathon page and
  `src/chains/tiramisu.ts` instead.

## 7. Testing without a chain

**What happened.** There is no in-memory or mock client in the SDK, so unit tests either need the
testnet or a hand-written stand-in. Stet puts the few calls it uses behind an interface
(`src/lib/arkiv/backend.ts`) with a `MemoryBackend` for tests and offline UI work.

**Would help.** A published in-memory test client with the same `select`/`executeBatch`/`getEntity`
surface, so projects can test their Arkiv logic in CI.

## 8. Owner vs creator: which one to trust isn't in the README

**Surface:** TypeScript SDK query builder, `@arkiv-network/sdk` 0.8.1.

**Expected.** The README's query example uses `.ownedBy(address)`, so the first version of Stet
trusted a run when its `owner` was Stet's wallet.

**What happened.** Ownership is transferable (`changeOwnership`), so a forger could write a run
under a real run id and later hand it to Stet's wallet, and it would pass an owner check. The fix
is `$creator`, which never changes: `.createdBy(address)`, or `$creator = addr(0x…)` over raw
JSON-RPC. This is only explained in the JSDoc on `createdBy` in `src/query/queryBuilder.ts` ("The
creator never changes; the owner does").

**Reproduce.** `grep -n "ownedBy\|createdBy" node_modules/@arkiv-network/sdk/README.md` finds only
`ownedBy`.

**Would help.** One README sentence: trust checks should filter on `$creator`, with a
`createdBy` example beside `ownedBy`.

## What worked well

- `executeBatch` made writing all of a run's facts one transaction.
- Typed attribute constructors (`bytes32`, `key`, `u64`) caught bad values before sending.
- `select({...})` narrows result types to the selected fields, so reading a field you didn't
  select is a compile error rather than a silent `undefined`.
- `permissionlessExtension` is exactly the primitive a censorship-resistant record needs: a third
  party can keep a brief alive without being able to change it (`npm run extend`, an
  `executeBatch` of `extensions` from any wallet).
- Direct JSON-RPC (`arkiv_query`) answers browser requests from any origin, so
  `public/reader.html` reads and verifies briefs with plain `fetch` and no libraries. Tested on
  18 October 2026 from the Tiramisu explorer's origin and from the Stet deployment.
