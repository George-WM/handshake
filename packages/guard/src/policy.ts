import type { Verdict } from "@handshake/shared";
import type { QuickScanResult, TokenScanResult } from "./intercepta.js";

/** Traits that block a payment outright, regardless of score. */
const BLOCK_TRAITS = new Set([
  "known_scammer",
  "sanction_address",
  "sanction_address_communication",
  "blacklist",
  "fake_phishing_transfer",
  "fake_phishing_contract_communication",
  "rug_pull",
  "initiator_scam_transactions",
]);

const BLOCK_TOXIC_SCORE = 70;
const ESCALATE_TOXIC_SCORE = 30;

export interface PolicyInput {
  addressScan: QuickScanResult;
  tokenScan?: TokenScanResult;
  amountUsd: number;
  escalateThresholdUsd: number;
}

export interface PolicyOutput {
  verdict: Verdict;
  reasons: string[];
}

export function evaluatePolicy(input: PolicyInput): PolicyOutput {
  const { addressScan, tokenScan, amountUsd, escalateThresholdUsd } = input;
  const reasons: string[] = [];

  // 1. Recipient address: hard-block traits or extreme toxic score.
  const blockTraits = addressScan.traits.filter((t) => BLOCK_TRAITS.has(t.name));
  if (blockTraits.length > 0) {
    return {
      verdict: "BLOCK",
      reasons: blockTraits.map((t) => `payTo trait: ${t.name} — ${t.description}`),
    };
  }
  if (addressScan.toxicScore >= BLOCK_TOXIC_SCORE) {
    return {
      verdict: "BLOCK",
      reasons: [`payTo toxicScore ${addressScan.toxicScore} ≥ ${BLOCK_TOXIC_SCORE}`],
    };
  }

  // 2. Payment token: Intercepta's own action verdict.
  if (tokenScan?.action === "block") {
    return {
      verdict: "BLOCK",
      reasons: [
        `token action=block (${tokenScan.riskLevel}): ${tokenScan.detectors
          .map((d) => d.code)
          .join(", ")}`,
      ],
    };
  }

  // 3. Escalate on amount or medium risk.
  if (amountUsd > escalateThresholdUsd) {
    reasons.push(`amount $${amountUsd} > threshold $${escalateThresholdUsd}`);
  }
  if (addressScan.toxicScore >= ESCALATE_TOXIC_SCORE) {
    reasons.push(`payTo toxicScore ${addressScan.toxicScore} (medium risk)`);
  }
  if (tokenScan?.action === "warn") {
    reasons.push(`token action=warn (${tokenScan.riskLevel})`);
  }
  if (reasons.length > 0) {
    return { verdict: "ESCALATE", reasons };
  }

  return {
    verdict: "PASS",
    reasons: [`payTo toxicScore ${addressScan.toxicScore}, no risk traits`],
  };
}
