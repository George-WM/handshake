/**
 * Stage 6 DoD: live World ID device-grant verification, one path per run.
 *   tsx scripts/verify/verify-escalation.ts approve   — human approves → id_token verified
 *   tsx scripts/verify/verify-escalation.ts deny      — human denies → access_denied, no action
 *   tsx scripts/verify/verify-escalation.ts expire    — untouched → expired_token after ~20 min
 *
 * Exercises the real sandbox IdP end to end (no payment attached; the full
 * guard→escalate→pay pipeline is demo:escalate once the Intercepta key is in).
 */
import { requestHumanApproval } from "../../apps/agent/src/worldid.js";
import { requireEnv } from "../../packages/shared/src/index.js";

const mode = process.argv[2] as "approve" | "deny" | "expire";
if (!["approve", "deny", "expire"].includes(mode)) {
  console.error("Usage: tsx scripts/verify/verify-escalation.ts <approve|deny|expire>");
  process.exit(2);
}

const outcome = await requestHumanApproval({
  clientId: requireEnv("WORLD_ID_CLIENT_ID"),
  clientSecret: requireEnv("WORLD_ID_CLIENT_SECRET"),
  onPrompt: (p) => {
    console.log(`\n=== HUMAN ACTION REQUIRED — mode: ${mode.toUpperCase()} ===`);
    console.log(`Approval link: ${p.verificationUri}`);
    console.log(`User code:     ${p.userCode}`);
    console.log(`Expires in:    ${Math.round(p.expiresIn / 60)} min`);
    if (mode === "expire") console.log(">>> do NOTHING with this link — we are waiting for expiry <<<");
    if (mode === "deny") console.log(">>> open the link and press DENY <<<");
    if (mode === "approve") console.log(">>> open the link, verify with World App, APPROVE <<<");
  },
});

console.log(`\noutcome: ${JSON.stringify(outcome)}`);

const expected = { approve: "approved", deny: "denied", expire: "expired" }[mode];
const protectedActionRan = outcome.approved; // stand-in for "payment would be signed"

if (outcome.outcome !== expected) {
  console.error(`[verify-escalation] FAILED — expected ${expected}, got ${outcome.outcome}`);
  process.exit(1);
}
if (mode === "approve" && !protectedActionRan) {
  console.error("[verify-escalation] FAILED — approved but action gate closed");
  process.exit(1);
}
if (mode !== "approve" && protectedActionRan) {
  console.error("[verify-escalation] FAILED — non-approved path must never run the action");
  process.exit(1);
}
console.log(`[verify-escalation] PASSED (${mode}) — protected action ${protectedActionRan ? "ran" : "did NOT run"}`);
