import { EventEmitter } from "node:events";

export type Verdict = "PASS" | "BLOCK" | "ESCALATE";

export type AttemptStatus =
  | "running"
  | "paid"
  | "blocked"
  | "denied"
  | "expired"
  | "failed";

/**
 * Events emitted by the payment pipeline. Consumed by the CLI logger and,
 * in stage 8, streamed to the dashboard over SSE.
 */
export type PipelineEvent =
  | { type: "attempt_started"; id: string; endpoint: string; at: number }
  | {
      type: "payment_required";
      id: string;
      payTo: string;
      amountUsd: number;
      asset: string;
      network: string;
    }
  | { type: "screening_started"; id: string; address: string }
  | {
      type: "screening_result";
      id: string;
      toxicScore: number;
      traits: { name: string; risk: number; description: string }[];
      raw: unknown;
    }
  | {
      type: "token_screening_result";
      id: string;
      action: string;
      riskLevel: string;
      detectors: { code: string; description: string }[];
      raw: unknown;
    }
  | { type: "verdict"; id: string; verdict: Verdict; reasons: string[] }
  | {
      type: "escalation_started";
      id: string;
      verificationUri: string;
      userCode: string;
      expiresIn: number;
    }
  | {
      type: "escalation_result";
      id: string;
      outcome: "approved" | "denied" | "expired" | "error";
      detail?: string;
    }
  | { type: "payment_settled"; id: string; transaction?: string }
  | {
      type: "attempt_finished";
      id: string;
      status: AttemptStatus;
      detail?: string;
      at: number;
    };

class PipelineBus extends EventEmitter {
  emitEvent(event: PipelineEvent): void {
    this.emit("event", event);
  }

  onEvent(listener: (event: PipelineEvent) => void): () => void {
    this.on("event", listener);
    return () => this.off("event", listener);
  }
}

export const pipelineBus = new PipelineBus();
