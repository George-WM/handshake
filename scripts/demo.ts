/**
 * One-command demo runner: spawns the seller, runs the agent CLI scenario,
 * shuts the seller down, and exits with the scenario's expected-outcome code.
 * Usage: tsx scripts/demo.ts <pass|block|escalate>
 */
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { optionalEnv } from "../packages/shared/src/index.js";

const scenario = process.argv[2];
if (!scenario || !["pass", "block", "escalate"].includes(scenario)) {
  console.error("Usage: tsx scripts/demo.ts <pass|block|escalate>");
  process.exit(2);
}

const port = optionalEnv("SELLER_PORT", "4021");
const base = `http://localhost:${port}`;

// Reuse an already-running seller (e.g. during dashboard demos); otherwise spawn one.
let seller: ReturnType<typeof spawn> | undefined;
const alreadyRunning = await fetch(base + "/api/data").then(
  () => true,
  () => false,
);
if (!alreadyRunning) {
  seller = spawn("pnpm", ["exec", "tsx", "apps/seller/src/index.ts"], {
    stdio: ["ignore", "ignore", "inherit"],
  });
  for (let i = 0; i < 40; i++) {
    if (await fetch(base + "/api/data").then(() => true, () => false)) break;
    await sleep(250);
  }
}

const cli = spawn("pnpm", ["exec", "tsx", "apps/agent/src/cli.ts", scenario], {
  stdio: "inherit",
});
const code: number = await new Promise((resolve) =>
  cli.on("exit", (c) => resolve(c ?? 1)),
);

seller?.kill("SIGTERM");
process.exit(code);
