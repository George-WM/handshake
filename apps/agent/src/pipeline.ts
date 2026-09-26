import { randomUUID } from "node:crypto";
import { wrapFetchWithPayment, x402HTTPClient } from "@x402/fetch";
import { x402Client } from "@x402/core/client";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";
import {
  pipelineBus,
  requireEnv,
  type AttemptStatus,
  type Verdict,
} from "@handshake/shared";
import type { GuardDecision, GuardFn } from "@handshake/guard";

// All demo payments are Base Sepolia USDC (6 decimals).
const USDC_DECIMALS = 6;

export type { GuardDecision, GuardFn, GuardInput } from "@handshake/guard";

export interface PaymentResult {
  id: string;
  status: AttemptStatus;
  verdict?: Verdict;
  reasons?: string[];
  body?: unknown;
  detail?: string;
}

/**
 * Requests a paid resource. On HTTP 402 the x402 client intercepts the payment
 * BEFORE signing via onBeforePaymentCreation; when a guard is provided its
 * decision determines whether the payment is signed at all.
 */
export async function payForResource(
  url: string,
  opts: { guard?: GuardFn } = {},
): Promise<PaymentResult> {
  const id = randomUUID();
  const signer = privateKeyToAccount(
    requireEnv("EVM_PRIVATE_KEY") as `0x${string}`,
  );

  let decision: GuardDecision | undefined;

  // spendControls off: policy lives entirely in our guard, not the SDK defaults.
  const client = x402Client.fromConfig({
    schemes: [{ network: "eip155:*", client: new ExactEvmScheme(signer) }],
    spendControls: false,
  });

  client.onBeforePaymentCreation(async (ctx) => {
    const req = ctx.selectedRequirements;
    const amountUsd = Number(req.amount) / 10 ** USDC_DECIMALS;
    pipelineBus.emitEvent({
      type: "payment_required",
      id,
      payTo: req.payTo,
      amountUsd,
      asset: req.asset,
      network: req.network,
    });
    if (!opts.guard) return;
    decision = await opts.guard({
      attemptId: id,
      payTo: req.payTo,
      amountUsd,
      asset: req.asset,
      network: req.network,
    });
    pipelineBus.emitEvent({
      type: "verdict",
      id,
      verdict: decision.verdict,
      reasons: decision.reasons,
    });
    if (!decision.allow) {
      return { abort: true as const, reason: decision.reasons.join("; ") };
    }
  });

  const fetchWithPayment = wrapFetchWithPayment(fetch, client);
  const httpClient = new x402HTTPClient(client);

  pipelineBus.emitEvent({ type: "attempt_started", id, endpoint: url, at: Date.now() });

  try {
    const response = await fetchWithPayment(url, { method: "GET" });
    const result = await httpClient.processResponse(response);

    if (result.paymentStatus === "settled") {
      const settle = result.header as { transaction?: string } | undefined;
      pipelineBus.emitEvent({
        type: "payment_settled",
        id,
        transaction: settle?.transaction,
      });
      pipelineBus.emitEvent({ type: "attempt_finished", id, status: "paid", at: Date.now() });
      return {
        id,
        status: "paid",
        verdict: decision?.verdict ?? "PASS",
        reasons: decision?.reasons,
        body: result.body,
        detail: settle?.transaction,
      };
    }

    const detail = `paymentStatus=${result.paymentStatus} http=${result.status}`;
    pipelineBus.emitEvent({ type: "attempt_finished", id, status: "failed", detail, at: Date.now() });
    return { id, status: "failed", verdict: decision?.verdict, detail };
  } catch (error) {
    // A guard abort surfaces as a thrown error from the wrapped fetch.
    if (decision && !decision.allow) {
      const status = decision.status ?? "blocked";
      pipelineBus.emitEvent({
        type: "attempt_finished",
        id,
        status,
        detail: decision.reasons.join("; "),
        at: Date.now(),
      });
      return { id, status, verdict: decision.verdict, reasons: decision.reasons };
    }
    const detail = error instanceof Error ? error.message : String(error);
    pipelineBus.emitEvent({ type: "attempt_finished", id, status: "failed", detail, at: Date.now() });
    return { id, status: "failed", detail };
  }
}
