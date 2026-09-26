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
  /** Screen the payment token too (stage 5). Mainnet chainId for reputation data. */
  scanTokenChainId?: string;
  onEscalate?: EscalateFn;
}

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
    if (options.scanTokenChainId) {
      tokenScan = await scanToken(
        input.asset,
        options.interceptaApiKey,
        options.scanTokenChainId,
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
