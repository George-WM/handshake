/**
 * Stage 4 (offline half): unit checks for the policy engine.
 * Fixtures mirror Intercepta's documented response schema — they exercise
 * evaluatePolicy() only and are NOT a substitute for the live-API DoD
 * (pnpm demo:block), which must pass before stage 4 is complete.
 */
import { evaluatePolicy } from "../../packages/guard/src/policy.js";
import type { QuickScanResult, TokenScanResult } from "../../packages/guard/src/intercepta.js";

const clean: QuickScanResult = { toxicScore: 0, traits: [] };
const sanctioned: QuickScanResult = {
  toxicScore: 95,
  traits: [
    { risk: 3, name: "sanction_address", txsCount: 1, description: "OFAC sanctioned" },
  ],
};
const medium: QuickScanResult = { toxicScore: 45, traits: [] };
const fakeToken: TokenScanResult = {
  apiVersion: "2.3.1",
  riskScore: 70,
  riskLevel: "high",
  category: "malicious",
  trust: "neutral",
  action: "block",
  detectors: [{ code: "FAKE_TOKEN", description: "fake token" }],
};

const cases: {
  name: string;
  input: Parameters<typeof evaluatePolicy>[0];
  expect: string;
}[] = [
  {
    name: "clean address, small amount → PASS",
    input: { addressScan: clean, amountUsd: 0.001, escalateThresholdUsd: 0.1 },
    expect: "PASS",
  },
  {
    name: "sanctioned trait → BLOCK",
    input: { addressScan: sanctioned, amountUsd: 0.001, escalateThresholdUsd: 0.1 },
    expect: "BLOCK",
  },
  {
    name: "high toxicScore without trait → BLOCK",
    input: {
      addressScan: { toxicScore: 80, traits: [] },
      amountUsd: 0.001,
      escalateThresholdUsd: 0.1,
    },
    expect: "BLOCK",
  },
  {
    name: "clean address, amount over threshold → ESCALATE",
    input: { addressScan: clean, amountUsd: 0.5, escalateThresholdUsd: 0.1 },
    expect: "ESCALATE",
  },
  {
    name: "medium toxicScore → ESCALATE",
    input: { addressScan: medium, amountUsd: 0.001, escalateThresholdUsd: 0.1 },
    expect: "ESCALATE",
  },
  {
    name: "token action=block → BLOCK",
    input: {
      addressScan: clean,
      tokenScan: fakeToken,
      amountUsd: 0.001,
      escalateThresholdUsd: 0.1,
    },
    expect: "BLOCK",
  },
];

let failures = 0;
for (const c of cases) {
  const result = evaluatePolicy(c.input);
  if (result.verdict === c.expect) {
    console.log(`  ✓ ${c.name} (${result.reasons[0] ?? ""})`);
  } else {
    failures++;
    console.error(`  ✗ ${c.name} — got ${result.verdict}, want ${c.expect}`);
  }
}

if (failures > 0) {
  console.error(`\n[verify-guard] FAILED (${failures})`);
  process.exit(1);
}
console.log("\n[verify-guard] PASSED (policy engine offline checks)");
console.log("[verify-guard] NOTE: live Intercepta verification still required: pnpm demo:block");
