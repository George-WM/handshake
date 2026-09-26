import type { EscalateFn } from "@handshake/guard";
import { pipelineBus } from "@handshake/shared";
import { requestHumanApproval } from "./worldid.js";

/**
 * Builds the ESCALATE handler: World ID device grant, with the approval link
 * surfaced through pipeline events (CLI prints it; dashboard renders it + QR).
 * Returns undefined when World ID credentials are not configured.
 */
export function buildEscalateFn(): EscalateFn | undefined {
  const clientId = process.env.WORLD_ID_CLIENT_ID;
  const clientSecret = process.env.WORLD_ID_CLIENT_SECRET;
  if (!clientId || !clientSecret) return undefined;

  return async (input) => {
    const outcome = await requestHumanApproval({
      clientId,
      clientSecret,
      onPrompt: (prompt) =>
        pipelineBus.emitEvent({
          type: "escalation_started",
          id: input.attemptId,
          verificationUri: prompt.verificationUri,
          userCode: prompt.userCode,
          expiresIn: prompt.expiresIn,
        }),
    });
    pipelineBus.emitEvent({
      type: "escalation_result",
      id: input.attemptId,
      outcome: outcome.outcome,
      detail: outcome.detail,
    });
    return outcome;
  };
}
