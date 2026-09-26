/**
 * First check to run the moment the Intercepta API key arrives — no payment,
 * two live API calls:
 *  1. quick-scan of the sanctioned Tornado Cash payTo used by /api/risky —
 *     must surface a BLOCK-grade verdict, or the demo:block scenario won't block.
 *  2. scan-token of the FAKE_TOKEN example address from Intercepta's docs.
 */
import { quickScanAddress, scanToken } from "../../packages/guard/src/intercepta.js";
import { evaluatePolicy } from "../../packages/guard/src/policy.js";
import { optionalEnv, requireEnv } from "../../packages/shared/src/index.js";

const apiKey = requireEnv("INTERCEPTA_API_KEY");
const riskyPayTo = optionalEnv(
  "RISKY_PAYTO_ADDRESS",
  "0x098B716B8Aaf21512996dC57EB0615e2383E2f96",
);
// Base mainnet USDC — the mainnet equivalent the guard screens for the demo's
// Base Sepolia payment asset. Expect trust=whitelist / action=info.
const PAYMENT_TOKEN_MAINNET = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

console.log(`[verify-intercepta] quick-scan ${riskyPayTo} (BLOCK demo payTo)`);
const scan = await quickScanAddress(riskyPayTo, apiKey);
console.log(JSON.stringify(scan, null, 2));

const verdict = evaluatePolicy({
  addressScan: scan,
  amountUsd: 0.001,
  escalateThresholdUsd: Number(optionalEnv("ESCALATE_THRESHOLD_USD", "0.10")),
});
console.log(`policy verdict: ${verdict.verdict} — ${verdict.reasons.join("; ")}`);

if (verdict.verdict !== "BLOCK") {
  console.error(
    "\n[verify-intercepta] FAILED — the /api/risky payTo does not screen as BLOCK." +
      "\nPick a different flagged mainnet address for RISKY_PAYTO_ADDRESS.",
  );
  process.exit(1);
}

console.log(`\n[verify-intercepta] scan-token ${PAYMENT_TOKEN_MAINNET} (Base mainnet USDC)`);
const token = await scanToken(PAYMENT_TOKEN_MAINNET, apiKey, "8453");
console.log(JSON.stringify(token, null, 2));
if (token.action !== "info" || token.trust !== "whitelist") {
  console.error(
    `[verify-intercepta] FAILED — expected whitelisted USDC (info), got action=${token.action} trust=${token.trust}`,
  );
  process.exit(1);
}
console.log("token verdict: whitelist/info ✓ (block-action path covered by verify-guard unit checks)");

console.log("\n[verify-intercepta] PASSED — key works, BLOCK payTo confirmed. Next: pnpm demo:block");
