/**
 * Stage 3 DoD: the buyer agent completes a real x402 payment end-to-end
 * (no guard yet): 402 → sign EIP-3009 → facilitator settles on Base Sepolia.
 *
 * Requires the buyer wallet (EVM_PRIVATE_KEY) to hold Base Sepolia USDC.
 */
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { optionalEnv } from "../../packages/shared/src/index.js";
import { payForResource } from "../../apps/agent/src/pipeline.js";

const port = optionalEnv("SELLER_PORT", "4021");
const base = `http://localhost:${port}`;

const seller = spawn("pnpm", ["exec", "tsx", "apps/seller/src/index.ts"], {
  stdio: ["ignore", "pipe", "inherit"],
});
seller.stdout.on("data", (d: Buffer) => process.stdout.write(`  [seller] ${d}`));

try {
  for (let i = 0; i < 40; i++) {
    try {
      await fetch(base + "/api/data");
      break;
    } catch {
      await sleep(250);
    }
  }

  const result = await payForResource(`${base}/api/data`);
  console.log(`\n[verify-payment] result: ${JSON.stringify(result, null, 2)}`);

  if (result.status !== "paid") {
    console.error(`[verify-payment] FAILED — expected status "paid"`);
    process.exit(1);
  }
  console.log(`[verify-payment] PASSED — settled tx: ${result.detail ?? "n/a"}`);
} finally {
  seller.kill("SIGTERM");
}
