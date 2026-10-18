import { createPublicClient, createWalletClient } from "@arkiv-network/sdk";
import { bool, bytes32, i32, key as keyAttr, str, u64 } from "@arkiv-network/sdk/attr";
import { tiramisu } from "@arkiv-network/sdk/chains";
import { and, eq } from "@arkiv-network/sdk/query";
import { ExpirationTime } from "@arkiv-network/sdk/utils";
import { http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

/**
 * The slice of Arkiv Stet uses, behind an interface so the store can be tested without a chain.
 * `SdkBackend` talks to Tiramisu through @arkiv-network/sdk; `MemoryBackend` is the test double.
 */

export type AttrValue = string | number | bigint | boolean;
/** Attribute values tagged with the Arkiv type to store them as. */
export type TypedAttr =
  | { t: "str"; v: string }
  | { t: "i32"; v: number }
  | { t: "u64"; v: bigint }
  | { t: "bool"; v: boolean }
  | { t: "bytes32"; v: Hex }
  | { t: "key"; v: Hex };

export type CreateItem = {
  payload: Uint8Array;
  contentType: string;
  attributes: Record<string, TypedAttr>;
  days: number;
};

export type StoredEntity = {
  key: Hex;
  owner: Hex | null;
  payload: Uint8Array;
  attributes: Record<string, AttrValue>;
  readonly: boolean;
  createdAt: bigint | null;
  expiresAt: bigint | null;
};

export interface ArkivBackend {
  /** The address that signs Stet's writes, or null when the deployment is read-only. */
  readonly writer: Hex | null;
  /** Creates entities in one transaction. Created entities are read-only and anyone may extend them. */
  create(items: CreateItem[]): Promise<{ txHash: Hex; keys: Hex[] }>;
  /** Entities whose string attributes equal every value given. */
  find(where: Record<string, string>, limit?: number): Promise<StoredEntity[]>;
  get(key: Hex): Promise<StoredEntity | null>;
}

export const EXPLORER = "https://tiramisu.explorer.arkiv.network";

const toSdkAttr = (a: TypedAttr) => {
  switch (a.t) {
    case "str":
      return str(a.v);
    case "i32":
      return i32(a.v);
    case "u64":
      return u64(a.v);
    case "bool":
      return bool(a.v);
    case "bytes32":
      return bytes32(a.v);
    case "key":
      return keyAttr(a.v);
  }
};

type SdkEntity = {
  key?: Hex;
  owner?: Hex;
  payload?: Uint8Array;
  attributes?: Readonly<Record<string, { value: unknown }>>;
  creationFlags?: { readonly: boolean };
  createdAt?: bigint;
  expiresAt?: bigint;
};

const fromSdk = (e: SdkEntity): StoredEntity => ({
  key: e.key as Hex,
  owner: e.owner ?? null,
  payload: e.payload ?? new Uint8Array(),
  attributes: Object.fromEntries(Object.entries(e.attributes ?? {}).map(([k, v]) => [k, v.value as AttrValue])),
  readonly: Boolean(e.creationFlags?.readonly),
  createdAt: e.createdAt ?? null,
  expiresAt: e.expiresAt ?? null,
});

export class SdkBackend implements ArkivBackend {
  readonly writer: Hex | null;
  private readonly pub = createPublicClient({ chain: tiramisu, transport: http(process.env.ARKIV_RPC_URL || undefined) });
  private readonly wallet;

  constructor(privateKey?: string) {
    const pk = privateKey?.trim();
    if (pk) {
      const account = privateKeyToAccount((pk.startsWith("0x") ? pk : `0x${pk}`) as Hex);
      this.wallet = createWalletClient({ chain: tiramisu, transport: http(process.env.ARKIV_RPC_URL || undefined), account });
      this.writer = account.address;
    } else {
      this.wallet = null;
      this.writer = null;
    }
  }

  async create(items: CreateItem[]) {
    if (!this.wallet) throw new Error("No ARKIV_PRIVATE_KEY set: this deployment can read from Arkiv but not write.");
    const { txHash, createdEntities } = await this.wallet.executeBatch({
      creates: items.map((it) => ({
        payload: it.payload,
        contentType: it.contentType as "application/json",
        attributes: Object.fromEntries(Object.entries(it.attributes).map(([k, v]) => [k, toSdkAttr(v)])),
        expires: ExpirationTime.fromDays(it.days),
        flags: { readonly: true, permissionlessExtension: true },
      })),
    });
    return { txHash, keys: createdEntities };
  }

  async find(where: Record<string, string>, limit = 50) {
    const conds = Object.entries(where).map(([k, v]) => eq(k, v));
    const res = await this.pub
      .select()
      .where(conds.length === 1 ? conds[0] : and(conds))
      .limit(limit)
      .fetch();
    return res.entities.map((e) => fromSdk(e as SdkEntity));
  }

  async get(key: Hex) {
    try {
      return fromSdk((await this.pub.getEntity(key)) as SdkEntity);
    } catch (err) {
      if (/not found|does not exist/i.test(String(err))) return null;
      throw err;
    }
  }
}

/** An in-memory Arkiv for tests and offline development. Behaves like the chain for Stet's purposes. */
export class MemoryBackend implements ArkivBackend {
  readonly entities = new Map<Hex, StoredEntity>();
  private n = 0;
  private block = BigInt(1);
  constructor(readonly writer: Hex | null = "0x00000000000000000000000000000000000057e7") {}

  async create(items: CreateItem[]) {
    if (!this.writer) throw new Error("read-only");
    return this.createAs(this.writer, items);
  }

  async createAs(owner: Hex, items: CreateItem[]) {
    const keys = items.map((it) => {
      const key = `0x${(++this.n).toString(16).padStart(64, "0")}` as Hex;
      this.entities.set(key, {
        key,
        owner,
        payload: it.payload,
        attributes: Object.fromEntries(Object.entries(it.attributes).map(([k, v]) => [k, v.v])),
        readonly: true,
        createdAt: this.block,
        expiresAt: this.block + BigInt(it.days * 43200),
      });
      return key;
    });
    this.block++;
    return { txHash: `0x${"ab".repeat(32)}` as Hex, keys };
  }

  async find(where: Record<string, string>, limit = 50) {
    return [...this.entities.values()].filter((e) => Object.entries(where).every(([k, v]) => e.attributes[k] === v)).slice(0, limit);
  }

  async get(key: Hex) {
    return this.entities.get(key) ?? null;
  }
}
