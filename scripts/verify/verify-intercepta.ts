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
  "0x722122dF12D4e14e13Ac3b6895a86e84145b6967",
);
const FAKE_TOKEN_EXAMPLE = "0xd034ae6322251877bd4361e4c9afeddfd37af00c";

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

console.log(`\n[verify-intercepta] scan-token ${FAKE_TOKEN_EXAMPLE} (docs FAKE_TOKEN example)`);
try {
  const token = await scanToken(FAKE_TOKEN_EXAMPLE, apiKey, "1");
  console.log(JSON.stringify(token, null, 2));
  console.log(
    token.action === "block"
      ? "token verdict: action=block ✓"
      : `token verdict: action=${token.action} (not block — pick another address for the stage-5 check)`,
  );
} catch (error) {
  console.warn(`scan-token call failed (non-fatal): ${error instanceof Error ? error.message : error}`);
}

console.log("\n[verify-intercepta] PASSED — key works, BLOCK payTo confirmed. Next: pnpm demo:block");
