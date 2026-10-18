"use client";

import { createPublicClient, createWalletClient } from "@arkiv-network/sdk";
import { str } from "@arkiv-network/sdk/attr";
import { tiramisu } from "@arkiv-network/sdk/chains";
import { and, eq } from "@arkiv-network/sdk/query";
import { ExpirationTime, jsonToPayload } from "@arkiv-network/sdk/utils";
import { custom, http, type Hex } from "viem";

/**
 * Arkiv from the visitor's own browser and wallet, with no Stet server in between:
 * - file a challenge, signed by the visitor's wallet, so it lives under their address;
 * - keep a brief alive (extendEntity on the brief and its facts; allowed by permissionlessExtension);
 * - watch Arkiv's entity events, so new challenges and extensions appear without a reload.
 */

export const STET_WRITER = "0x441aB97848BB539187D93EF3eF7125D1FbABbf27" as Hex;
export const FAUCET_URL = "https://hub.arkiv.network/faucet";
const CHAIN_HEX = "0x7614d1"; // 7738577
const RPC = tiramisu.rpcUrls.default.http[0];

type Eip1193 = { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> };
const ethereum = () => (typeof window !== "undefined" ? (window as unknown as { ethereum?: Eip1193 }).ethereum : undefined);

export const hasWallet = () => Boolean(ethereum());

export const publicArkiv = () => createPublicClient({ chain: tiramisu, transport: http(RPC) });

/** Connects the visitor's wallet and switches it to Tiramisu, adding the network if needed. */
export async function connectWallet(): Promise<Hex> {
  const eth = ethereum();
  if (!eth) throw new Error("No browser wallet found. Install MetaMask (or another EVM wallet) to sign from your own address.");
  const [address] = (await eth.request({ method: "eth_requestAccounts" })) as Hex[];
  try {
    await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN_HEX }] });
  } catch (err) {
    if ((err as { code?: number }).code !== 4902) throw err;
    await eth.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: CHAIN_HEX,
          chainName: "Arkiv Tiramisu",
          nativeCurrency: { name: "Golem", symbol: "GLM", decimals: 18 },
          rpcUrls: [RPC],
          blockExplorerUrls: ["https://tiramisu.explorer.arkiv.network"],
        },
      ],
    });
  }
  return address;
}

const wallet = (address: Hex) => createWalletClient({ chain: tiramisu, transport: custom(ethereum()!), account: address });

export async function balanceOf(address: Hex): Promise<bigint> {
  return publicArkiv().getBalance({ address });
}

/** Files a challenge from the visitor's wallet. Same entity shape as `npm run challenge`. */
export async function fileChallenge(
  address: Hex,
  c: { runId: string; target: string; text: string; evidenceUrl: string | null },
): Promise<{ key: Hex; txHash: Hex }> {
  const text = c.text.trim();
  if (text.length < 10 || text.length > 2000) throw new Error("A challenge needs 10 to 2,000 characters.");
  const body = { evidence_url: c.evidenceUrl || null, run_id: c.runId, schema: "stet.challenge/1", target: c.target, text };
  const { entityKey, txHash } = await wallet(address).createEntity({
    payload: jsonToPayload(body),
    contentType: "application/json",
    attributes: { app: str("stet"), kind: str("challenge"), run_id: str(c.runId), target: str(c.target) },
    expires: ExpirationTime.fromDays(365),
    flags: { readonly: true, permissionlessExtension: true },
  });
  return { key: entityKey, txHash };
}

/** Extends a brief and its facts from the visitor's wallet. Anyone may; nobody can change them. */
export async function keepAliveFromBrowser(address: Hex, runId: string, days: number): Promise<{ txHash: Hex; extended: number }> {
  const pub = publicArkiv();
  const keys: Hex[] = [];
  for (const kind of ["run", "fact"]) {
    const res = await pub
      .select({ key: true })
      .where(and(eq("app", "stet"), eq("kind", kind), eq("run_id", runId)))
      .createdBy(STET_WRITER)
      .limit(200)
      .fetch();
    keys.push(...res.entities.map((e) => e.key));
  }
  if (!keys.length) throw new Error("This brief isn't on Arkiv.");
  const { txHash } = await wallet(address).executeBatch({
    extensions: keys.map((entityKey) => ({ entityKey, expires: ExpirationTime.fromDays(days) })),
  });
  return { txHash, extended: keys.length };
}

/** Current block and seconds per block, to turn an expiry block into a date. */
export async function blockClock(): Promise<{ block: bigint; secondsPerBlock: number }> {
  const block = await publicArkiv().getBlockNumber();
  return { block, secondsPerBlock: 2 };
}

/**
 * Watches Arkiv's entity events and calls back on any creation or extension. The caller decides
 * what's relevant (cheap: it just refetches). Returns the unwatch function.
 */
export function watchArkiv(on: { created?: (key: Hex) => void; extended?: (key: Hex, expiresAt: bigint) => void }) {
  return publicArkiv().watchEntityEvents({
    onEntityCreated: (e) => on.created?.(e.entityKey),
    onExpiryExtended: (e) => on.extended?.(e.entityKey, e.expiresAt),
    onError: () => {},
    pollingInterval: 3000,
  });
}
