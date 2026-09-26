/**
 * World ID for Agents — human-owner approval via OIDC Device Authorization
 * Grant (RFC 8628) against the sandbox IdP. No SDK: raw fetch + jose.
 *
 * The id_token is verified HERE, on the backend, against the IdP's JWKS.
 * Nothing the agent/client relays (codes, tokens, handles) is ever trusted.
 */
import { createRemoteJWKSet, jwtVerify } from "jose";
import { setTimeout as sleep } from "node:timers/promises";
import type { EscalationOutcome } from "@handshake/guard";

const ISSUER = "https://sandbox.auth.world.org";
const DEVICE_AUTH_URL = `${ISSUER}/api/v1/device_authorization`;
const TOKEN_URL = `${ISSUER}/api/v1/token`;
const DEVICE_GRANT = "urn:ietf:params:oauth:grant-type:device_code";

const jwks = createRemoteJWKSet(new URL(`${ISSUER}/.well-known/jwks.json`));

export interface ApprovalPrompt {
  verificationUri: string;
  userCode: string;
  expiresIn: number;
}

interface DeviceAuthResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete: string;
  expires_in: number;
  interval: number;
}

/**
 * Runs one full device-grant approval: initiate → surface the approval link
 * to the human (via onPrompt) → poll → verify id_token on success.
 * Deny / expiry / errors all resolve to a non-approved outcome — the caller
 * must not run the protected action unless `approved` is true.
 */
export async function requestHumanApproval(opts: {
  clientId: string;
  clientSecret: string;
  onPrompt: (prompt: ApprovalPrompt) => void;
}): Promise<EscalationOutcome> {
  const startRes = await fetch(DEVICE_AUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: opts.clientId,
      client_secret: opts.clientSecret,
      scope: "openid",
    }),
  });
  if (!startRes.ok) {
    const body = await startRes.text().catch(() => "");
    return {
      approved: false,
      outcome: "error",
      detail: `device_authorization HTTP ${startRes.status} ${body}`,
    };
  }
  const start = (await startRes.json()) as DeviceAuthResponse;

  // user_code + approval link go to the human; device_code never leaves here.
  opts.onPrompt({
    verificationUri: start.verification_uri_complete,
    userCode: start.user_code,
    expiresIn: start.expires_in,
  });

  let intervalSec = start.interval || 5;
  const deadline = Date.now() + start.expires_in * 1000;

  while (Date.now() < deadline) {
    await sleep(intervalSec * 1000);

    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: DEVICE_GRANT,
        client_id: opts.clientId,
        client_secret: opts.clientSecret,
        device_code: start.device_code,
      }),
    });

    if (res.status === 503) {
      return { approved: false, outcome: "error", detail: "IdP temporarily unavailable" };
    }

    const body = (await res.json()) as {
      error?: string;
      id_token?: string;
    };

    if (res.ok && body.id_token) {
      try {
        const { payload } = await jwtVerify(body.id_token, jwks, {
          issuer: ISSUER,
          audience: opts.clientId,
        });
        return {
          approved: true,
          outcome: "approved",
          detail: `verified sub=${String(payload.sub).slice(0, 12)}… auth_time=${payload.auth_time}`,
        };
      } catch (error) {
        return {
          approved: false,
          outcome: "error",
          detail: `id_token verification failed: ${error instanceof Error ? error.message : error}`,
        };
      }
    }

    switch (body.error) {
      case "authorization_pending":
        continue;
      case "slow_down":
        intervalSec += 5;
        continue;
      case "access_denied":
        return { approved: false, outcome: "denied", detail: "human denied the request" };
      case "expired_token":
        return { approved: false, outcome: "expired", detail: "approval window expired" };
      default:
        return {
          approved: false,
          outcome: "error",
          detail: `token error: ${body.error ?? `HTTP ${res.status}`}`,
        };
    }
  }
  return { approved: false, outcome: "expired", detail: "approval window expired" };
}
