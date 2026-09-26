import { createGuard } from "@handshake/guard";
import { optionalEnv, pipelineBus } from "@handshake/shared";
import { buildEscalateFn } from "./escalation.js";
import { payForResource } from "./pipeline.js";

const scenario = process.argv[2];
const port = optionalEnv("SELLER_PORT", "4021");
const endpoints: Record<string, string> = {
  pass: `http://localhost:${port}/api/data`,
  block: `http://localhost:${port}/api/risky`,
  escalate: `http://localhost:${port}/api/premium`,
};

const url = scenario ? endpoints[scenario] : undefined;
if (!url) {
  console.error(`Usage: tsx apps/agent/src/cli.ts <pass|block|escalate>`);
  process.exit(2);
}

pipelineBus.onEvent((e) => {
  switch (e.type) {
    case "attempt_started":
      console.log(`▶ attempt ${e.id.slice(0, 8)} → ${e.endpoint}`);
      break;
    case "payment_required":
      console.log(
        `  402 payment required: $${e.amountUsd} → ${e.payTo} (${e.network})`,
      );
      break;
    case "screening_started":
      console.log(`  🔍 Intercepta screening ${e.address} ...`);
      break;
    case "screening_result":
      console.log(
        `  🔍 toxicScore=${e.toxicScore} traits=[${e.traits.map((t) => t.name).join(", ")}]`,
      );
      break;
    case "token_screening_result":
      console.log(`  🔍 token action=${e.action} riskLevel=${e.riskLevel}`);
      break;
    case "verdict":
      console.log(`  ⚖ verdict: ${e.verdict} — ${e.reasons.join("; ")}`);
      break;
    case "escalation_started":
      console.log(
        `  🙋 human approval required — code ${e.userCode}\n     ${e.verificationUri}`,
      );
      break;
    case "escalation_result":
      console.log(`  🙋 escalation ${e.outcome}${e.detail ? ` (${e.detail})` : ""}`);
      break;
    case "payment_settled":
      console.log(`  ✅ settled${e.transaction ? ` tx=${e.transaction}` : ""}`);
      break;
    case "attempt_finished":
      console.log(`■ finished: ${e.status}${e.detail ? ` — ${e.detail}` : ""}`);
      break;
  }
});

const apiKey = process.env.INTERCEPTA_API_KEY;
if (!apiKey) {
  console.warn(
    "⚠ INTERCEPTA_API_KEY not set — running UNGUARDED (dev only, invalid for demos)",
  );
}
const guard = apiKey
  ? createGuard({
      interceptaApiKey: apiKey,
      escalateThresholdUsd: Number(optionalEnv("ESCALATE_THRESHOLD_USD", "0.10")),
      onEscalate: buildEscalateFn(),
    })
  : undefined;

const result = await payForResource(url, { guard });
if (result.status === "paid") {
  console.log(`\nresponse body: ${JSON.stringify(result.body)}`);
}

// Each demo scenario has an expected terminal state.
const expected: Record<string, string[]> = {
  pass: ["paid"],
  block: ["blocked"],
  escalate: ["paid", "denied", "expired"],
};
process.exit(expected[scenario!]!.includes(result.status) ? 0 : 1);
