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

async function get<T>(path: string, apiKey: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "X-API-KEY": apiKey },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Intercepta ${path} failed: HTTP ${res.status} ${body}`);
  }
  return (await res.json()) as T;
}

/** Wallet-reputation scan of an address (mainnet reputation data). */
export function quickScanAddress(
  address: string,
  apiKey: string,
): Promise<QuickScanResult> {
  return get<QuickScanResult>(
    `/api/public/v2/extension/account/${address}/quick-scan`,
    apiKey,
  );
}

/** Token-contract risk scan (fake tokens, honeypots, rug pulls). */
export function scanToken(
  address: string,
  apiKey: string,
  chainId = "1",
): Promise<TokenScanResult> {
  return get<TokenScanResult>(
    `/api/public/v2/extension/token-intelligence/token/${address}/risks?chainId=${chainId}`,
    apiKey,
  );
}
