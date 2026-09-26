/**
 * Stage 2 DoD: the x402 seller returns 402 with a valid PAYMENT-REQUIRED header
 * (x402 V2) for all three demo endpoints, with the expected payTo per scenario.
 *
 * Starts the seller as a child process, probes it, then shuts it down.
 */
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { optionalEnv, requireEnv } from "../../packages/shared/src/index.js";

const port = Number(optionalEnv("SELLER_PORT", "4021"));
const sellerAddress = requireEnv("SELLER_ADDRESS").toLowerCase();
const riskyPayTo = optionalEnv(
  "RISKY_PAYTO_ADDRESS",
  "0x098B716B8Aaf21512996dC57EB0615e2383E2f96",
).toLowerCase();
const base = `http://localhost:${port}`;

interface PaymentRequirementsLike {
  scheme: string;
  network: string;
  payTo: string;
  amount: string;
  asset: string;
}

async function waitForServer(): Promise<void> {
  for (let i = 0; i < 40; i++) {
    try {
      await fetch(base + "/api/data");
      return;
    } catch {
      await sleep(250);
    }
  }
  throw new Error(`seller did not come up on ${base}`);
}

async function probe(
  path: string,
  expectedPayTo: string,
): Promise<{ ok: boolean; detail: string }> {
  const res = await fetch(base + path);
  if (res.status !== 402) {
    return { ok: false, detail: `expected 402, got ${res.status}` };
  }
  const header = res.headers.get("payment-required");
  if (!header) {
    return { ok: false, detail: "missing PAYMENT-REQUIRED header" };
  }
  const decoded = JSON.parse(Buffer.from(header, "base64").toString("utf8"));
  if (decoded.x402Version !== 2) {
    return { ok: false, detail: `x402Version=${decoded.x402Version}, want 2` };
  }
  const accepts: PaymentRequirementsLike[] = decoded.accepts ?? [];
  const match = accepts.find(
    (a) =>
      a.network === "eip155:84532" &&
      a.scheme === "exact" &&
      a.payTo.toLowerCase() === expectedPayTo,
  );
  if (!match) {
    return {
      ok: false,
      detail: `no matching requirement; accepts=${JSON.stringify(accepts)}`,
    };
  }
  return {
    ok: true,
    detail: `payTo=${match.payTo} amount=${match.amount} asset=${match.asset}`,
  };
}

const seller = spawn("pnpm", ["exec", "tsx", "apps/seller/src/index.ts"], {
  stdio: ["ignore", "pipe", "inherit"],
});
seller.stdout.on("data", (d: Buffer) => process.stdout.write(`  [seller] ${d}`));

let failures = 0;
try {
  await waitForServer();
  for (const [path, payTo] of [
    ["/api/data", sellerAddress],
    ["/api/risky", riskyPayTo],
    ["/api/premium", sellerAddress],
  ] as const) {
    const { ok, detail } = await probe(path, payTo);
    if (ok) {
      console.log(`  ✓ ${path} — ${detail}`);
    } else {
      failures++;
      console.error(`  ✗ ${path} — ${detail}`);
    }
  }
} finally {
  seller.kill("SIGTERM");
}

if (failures > 0) {
  console.error(`\n[verify-seller] FAILED (${failures})`);
  process.exit(1);
}
console.log("\n[verify-seller] PASSED");
