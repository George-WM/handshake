/**
 * Intercepta (Web3 Antivirus) API client.
 * This is the live risk-screening call made BEFORE any x402 payment is signed.
 * Docs: https://docs.web3antivirus.io
 */
const BASE_URL = "https://api.web3antivirus.io";

export interface QuickScanTrait {
  risk: number;
  name: string;
  txsCount?: number;
  description: string;
}

export interface QuickScanResult {
  toxicScore: number;
  traits: QuickScanTrait[];
}

export interface TokenScanResult {
  apiVersion: string;
  riskScore: number;
  riskLevel: "neutral" | "low" | "medium" | "high";
  category: string;
  trust: "whitelist" | "blocklist" | "neutral";
  action: "block" | "warn" | "info";
  detectors: { code: string; description: string }[];
  token?: { chainId: string; address: string; symbol?: string };
}

/** fetch with retry on transient network failures (3 attempts, 2s apart). */
async function fetchRetry(url: string, apiKey: string): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetch(url, { headers: { "X-API-KEY": apiKey } });
    } catch (error) {
      if (attempt >= 2) throw error;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

async function get<T>(path: string, apiKey: string): Promise<T> {
  const res = await fetchRetry(`${BASE_URL}${path}`, apiKey);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Intercepta ${path} failed: HTTP ${res.status} ${body}`);
  }
  return (await res.json()) as T;
}

/**
 * Wallet-reputation scan of an address (mainnet reputation data).
 * The endpoint only covers EOAs and 404s on contract/unseen addresses —
 * treated here as "no reputation data" rather than an error.
 */
export async function quickScanAddress(
  address: string,
  apiKey: string,
): Promise<QuickScanResult> {
  const res = await fetchRetry(
    `${BASE_URL}/api/public/v2/extension/account/${address}/quick-scan`,
    apiKey,
  );
  if (res.status === 404) {
    return { toxicScore: 0, traits: [] };
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Intercepta quick-scan failed: HTTP ${res.status} ${body}`);
  }
  return (await res.json()) as QuickScanResult;
}

/**
 * Token-contract risk scan (fake tokens, honeypots, rug pulls).
 * 404 = address is not a known ERC-20/NFT on that chain → neutral result.
 */
export async function scanToken(
  address: string,
  apiKey: string,
  chainId = "1",
): Promise<TokenScanResult> {
  const res = await fetchRetry(
    `${BASE_URL}/api/public/v2/extension/token-intelligence/token/${address}/risks?chainId=${chainId}`,
    apiKey,
  );
  if (res.status === 404) {
    return {
      apiVersion: "n/a",
      riskScore: 0,
      riskLevel: "neutral",
      category: "info",
      trust: "neutral",
      action: "info",
      detectors: [],
    };
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Intercepta scan-token failed: HTTP ${res.status} ${body}`);
  }
  return (await res.json()) as TokenScanResult;
}
