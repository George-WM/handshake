import { pipelineBus, type AttemptStatus, type Verdict } from "@handshake/shared";
import { quickScanAddress, scanToken } from "./intercepta.js";
import { evaluatePolicy } from "./policy.js";

export { quickScanAddress, scanToken } from "./intercepta.js";
export type { QuickScanResult, QuickScanTrait, TokenScanResult } from "./intercepta.js";
export { evaluatePolicy } from "./policy.js";

export interface GuardInput {
  attemptId: string;
  payTo: string;
  amountUsd: number;
  asset: string;
  network: string;
}

export interface GuardDecision {
  allow: boolean;
  verdict: Verdict;
  reasons: string[];
  status?: Extract<AttemptStatus, "blocked" | "denied" | "expired" | "failed">;
}

export interface EscalationOutcome {
  approved: boolean;
  outcome: "approved" | "denied" | "expired" | "error";
  detail?: string;
}

/** Human-approval channel for ESCALATE verdicts (World ID device grant, stage 6). */
export type EscalateFn = (input: GuardInput) => Promise<EscalationOutcome>;

export type GuardFn = (input: GuardInput) => Promise<GuardDecision>;

export interface GuardOptions {
  interceptaApiKey: string;
  escalateThresholdUsd: number;
  onEscalate?: EscalateFn;
}

/**
 * Token intelligence lives on mainnets, so testnet payment assets are screened
 * via their mainnet counterpart. Unmapped assets skip the token scan.
 */
const MAINNET_TOKEN_EQUIVALENTS: Record<string, { address: string; chainId: string }> = {
  // Base Sepolia USDC → Base mainnet USDC
  "0x036cbd53842c5426634e7929541ec2318f3dcf7e": {
    address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    chainId: "8453",
  },
};

/**
 * Builds the guard that runs inside x402's onBeforePaymentCreation hook —
 * i.e. after the 402 challenge, strictly before the payment is signed.
 */
export function createGuard(options: GuardOptions) {
  return async function guard(input: GuardInput): Promise<GuardDecision> {
    pipelineBus.emitEvent({
      type: "screening_started",
      id: input.attemptId,
      address: input.payTo,
    });

    const addressScan = await quickScanAddress(
      input.payTo,
      options.interceptaApiKey,
    );
    pipelineBus.emitEvent({
      type: "screening_result",
      id: input.attemptId,
      toxicScore: addressScan.toxicScore,
      traits: addressScan.traits.map((t) => ({
        name: t.name,
        risk: t.risk,
        description: t.description,
      })),
      raw: addressScan,
    });

    let tokenScan;
    const mainnetToken = MAINNET_TOKEN_EQUIVALENTS[input.asset.toLowerCase()];
    if (mainnetToken) {
      tokenScan = await scanToken(
        mainnetToken.address,
        options.interceptaApiKey,
        mainnetToken.chainId,
      );
      pipelineBus.emitEvent({
        type: "token_screening_result",
        id: input.attemptId,
        action: tokenScan.action,
        riskLevel: tokenScan.riskLevel,
        detectors: tokenScan.detectors,
        raw: tokenScan,
      });
    }

    const { verdict, reasons } = evaluatePolicy({
      addressScan,
      tokenScan,
      amountUsd: input.amountUsd,
      escalateThresholdUsd: options.escalateThresholdUsd,
    });

    if (verdict === "PASS") {
      return { allow: true, verdict, reasons };
    }
    if (verdict === "BLOCK") {
      return { allow: false, verdict, reasons, status: "blocked" };
    }

    // ESCALATE → human owner approval required.
    if (!options.onEscalate) {
      return {
        allow: false,
        verdict,
        reasons: [...reasons, "no approval channel configured"],
        status: "denied",
      };
    }
    const escalation = await options.onEscalate(input);
    if (escalation.approved) {
      return { allow: true, verdict, reasons };
    }
    return {
      allow: false,
      verdict,
      reasons: [...reasons, `human approval: ${escalation.outcome}`],
      status: escalation.outcome === "expired" ? "expired" : "denied",
    };
  };
}
