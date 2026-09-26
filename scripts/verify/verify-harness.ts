/**
 * Stage 1 DoD: harness is in place.
 * 1. Required scaffold files exist.
 * 2. requireEnv() fails loudly (exit 1 + message) when a variable is missing.
 * 3. TypeScript strict typecheck passes across the workspace.
 */
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const root = process.cwd();
let failures = 0;

function check(label: string, ok: boolean, detail?: string): void {
  if (ok) {
    console.log(`  ✓ ${label}`);
  } else {
    failures++;
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

console.log("[verify-harness] scaffold files");
for (const file of [
  "CLAUDE.md",
  "README.md",
  ".env.example",
  ".gitignore",
  "pnpm-workspace.yaml",
  "tsconfig.json",
  "packages/shared/src/env.ts",
  "packages/shared/src/events.ts",
]) {
  check(file, existsSync(path.join(root, file)));
}

console.log("[verify-harness] requireEnv fails loudly on missing var");
const envProbe = spawnSync(
  "pnpm",
  [
    "exec",
    "tsx",
    "-e",
    `import { requireEnv } from "./packages/shared/src/env.ts"; requireEnv("HANDSHAKE_DOES_NOT_EXIST");`,
  ],
  { encoding: "utf8" },
);
check(
  "exits 1 with a clear message",
  envProbe.status === 1 &&
    envProbe.stderr.includes("HANDSHAKE_DOES_NOT_EXIST"),
  `status=${envProbe.status}`,
);

console.log("[verify-harness] tsc --noEmit");
const tsc = spawnSync("pnpm", ["exec", "tsc", "--noEmit"], {
  encoding: "utf8",
});
check("typecheck passes", tsc.status === 0, tsc.stdout || tsc.stderr);

if (failures > 0) {
  console.error(`\n[verify-harness] FAILED (${failures} check(s))`);
  process.exit(1);
}
console.log("\n[verify-harness] PASSED");
