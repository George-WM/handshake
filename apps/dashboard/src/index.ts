import path from "node:path";
import express from "express";
import QRCode from "qrcode";
import { buildEscalateFn, payForResource } from "@handshake/agent";
import { createGuard } from "@handshake/guard";
import {
  optionalEnv,
  pipelineBus,
  type PipelineEvent,
} from "@handshake/shared";

const port = Number(optionalEnv("DASHBOARD_PORT", "3000"));
const sellerPort = optionalEnv("SELLER_PORT", "4021");

const endpoints: Record<string, string> = {
  pass: `http://localhost:${sellerPort}/api/data`,
  block: `http://localhost:${sellerPort}/api/risky`,
  escalate: `http://localhost:${sellerPort}/api/premium`,
};

const apiKey = process.env.INTERCEPTA_API_KEY;
if (!apiKey) {
  console.warn("[dashboard] ⚠ INTERCEPTA_API_KEY not set — payments run UNGUARDED");
}
const guard = apiKey
  ? createGuard({
      interceptaApiKey: apiKey,
      escalateThresholdUsd: Number(optionalEnv("ESCALATE_THRESHOLD_USD", "0.10")),
      onEscalate: buildEscalateFn(),
    })
  : undefined;

// ── In-memory attempt history, built from pipeline events ──
interface Attempt {
  id: string;
  at: number;
  endpoint: string;
  payTo?: string;
  amountUsd?: number;
  verdict?: string;
  reasons?: string[];
  status: string;
  detail?: string;
}
const attempts = new Map<string, Attempt>();

pipelineBus.onEvent((e: PipelineEvent) => {
  switch (e.type) {
    case "attempt_started":
      attempts.set(e.id, { id: e.id, at: e.at, endpoint: e.endpoint, status: "running" });
      break;
    case "payment_required": {
      const a = attempts.get(e.id);
      if (a) Object.assign(a, { payTo: e.payTo, amountUsd: e.amountUsd });
      break;
    }
    case "verdict": {
      const a = attempts.get(e.id);
      if (a) Object.assign(a, { verdict: e.verdict, reasons: e.reasons });
      break;
    }
    case "attempt_finished": {
      const a = attempts.get(e.id);
      if (a) Object.assign(a, { status: e.status, detail: e.detail });
      break;
    }
  }
});

const app = express();
app.use(express.static(path.join(import.meta.dirname, "../public")));

app.post("/api/trigger/:scenario", (req, res) => {
  const url = endpoints[req.params.scenario];
  if (!url) {
    res.status(400).json({ error: "unknown scenario" });
    return;
  }
  // Fire and forget — the UI follows progress over SSE.
  void payForResource(url, { guard }).catch((err) =>
    console.error("[dashboard] attempt crashed:", err),
  );
  res.json({ ok: true });
});

app.get("/api/history", (_req, res) => {
  res.json([...attempts.values()].sort((a, b) => b.at - a.at));
});

app.get("/api/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const unsubscribe = pipelineBus.onEvent((e) => {
    void (async () => {
      // Attach a QR code for the World ID approval link.
      const payload =
        e.type === "escalation_started"
          ? { ...e, qrDataUrl: await QRCode.toDataURL(e.verificationUri, { margin: 1 }) }
          : e;
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    })();
  });
  const keepAlive = setInterval(() => res.write(": ping\n\n"), 25_000);
  req.on("close", () => {
    clearInterval(keepAlive);
    unsubscribe();
  });
});

app.listen(port, () => {
  console.log(`[dashboard] http://localhost:${port}`);
  console.log(`[dashboard] seller expected on http://localhost:${sellerPort} (pnpm seller)`);
});
