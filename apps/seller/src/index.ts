import express from "express";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { optionalEnv, requireEnv } from "@handshake/shared";

const NETWORK = "eip155:84532"; // Base Sepolia
const FACILITATOR_URL = "https://x402.org/facilitator";

// OFAC-sanctioned Lazarus Group EOA (Ronin Bridge exploiter) — payTo for the
// BLOCK demo. Must be an EOA: Intercepta quick-scan 404s on contract addresses.
// The payment never executes: the buyer's guardrail aborts before signing.
const DEFAULT_RISKY_PAYTO = "0x098B716B8Aaf21512996dC57EB0615e2383E2f96";

const sellerAddress = requireEnv("SELLER_ADDRESS");
const riskyPayTo = optionalEnv("RISKY_PAYTO_ADDRESS", DEFAULT_RISKY_PAYTO);
const port = Number(optionalEnv("SELLER_PORT", "4021"));

const facilitatorClient = new HTTPFacilitatorClient({ url: FACILITATOR_URL });
const server = new x402ResourceServer(facilitatorClient).register(
  NETWORK,
  new ExactEvmScheme(),
);

const app = express();

app.use(
  paymentMiddleware(
    {
      "GET /api/data": {
        accepts: [
          { scheme: "exact", price: "$0.001", network: NETWORK, payTo: sellerAddress },
        ],
        description: "Tokyo weather data (PASS demo)",
        mimeType: "application/json",
      },
      "GET /api/risky": {
        accepts: [
          { scheme: "exact", price: "$0.001", network: NETWORK, payTo: riskyPayTo },
        ],
        description: "Same data, sanctioned payTo (BLOCK demo)",
        mimeType: "application/json",
      },
      "GET /api/premium": {
        accepts: [
          { scheme: "exact", price: "$0.50", network: NETWORK, payTo: sellerAddress },
        ],
        description: "Premium market report (ESCALATE demo)",
        mimeType: "application/json",
      },
    },
    server,
  ),
);

app.get("/api/data", (_req, res) => {
  res.json({ report: { city: "Tokyo", weather: "sunny", temperatureC: 21 } });
});

app.get("/api/risky", (_req, res) => {
  // Unreachable in the demo: the guardrail blocks payment to the sanctioned payTo.
  res.json({ report: { city: "Tokyo", weather: "sunny", temperatureC: 21 } });
});

app.get("/api/premium", (_req, res) => {
  res.json({
    report: {
      city: "Tokyo",
      forecast7d: ["sunny", "sunny", "rain", "cloudy", "sunny", "rain", "sunny"],
      alphaSignal: "buy",
    },
  });
});

app.listen(port, () => {
  console.log(`[seller] x402 paid API on http://localhost:${port}`);
  console.log(`[seller]   GET /api/data     $0.001 → ${sellerAddress} (PASS)`);
  console.log(`[seller]   GET /api/risky    $0.001 → ${riskyPayTo} (BLOCK)`);
  console.log(`[seller]   GET /api/premium  $0.50  → ${sellerAddress} (ESCALATE)`);
});
