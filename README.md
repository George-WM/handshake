# Handshake — AI Agent Payment Guardrail

> **One-liner:** Handshake screens every x402 payment an AI agent is about to sign with Intercepta's live risk API — auto-paying safe requests, blocking sanctioned/scam recipients with the reason on screen, and escalating high-value payments to the agent's human owner via World ID for Agents.

Built solo at **ETHGlobal Tokyo 2026**.

## Team

**George** — solo. GitHub: [@George-WM](https://github.com/George-WM)

## The problem (15 seconds)

AI agents are getting wallets. x402 makes agent payments frictionless — which means one prompt injection or one malicious seller is all it takes for an agent to stream money to a sanctioned address, a wallet drainer, or a fake-token honeypot. Agents need the same thing corporate cards have: a spend guardrail with a human in the loop.

## How it works

```
agent requests a paid API ──► HTTP 402 (x402 V2, Base Sepolia)
                                   │
                     onBeforePaymentCreation hook   ← BEFORE anything is signed
                                   │
                  Intercepta quick-scan of payTo (mainnet reputation)
                  [+ token scan of the payment asset]
                                   │
             ┌─────────────────────┼─────────────────────┐
           PASS                  BLOCK                ESCALATE
    auto-sign & pay       abort, log reason      World ID device grant:
    (EIP-3009, gasless)   (e.g. sanction_        owner approves in World App
                          address trait)         → pay │ deny/expiry → abort
```

The guard runs inside the x402 client's `onBeforePaymentCreation` lifecycle hook: the payment requirements (payTo, amount, asset, network) are inspected and screened **strictly before the EIP-3009 authorization is signed**. A `BLOCK` or a denied escalation returns `{ abort: true, reason }` — the signature never happens, so no funds can move.

## Demo (one command each)

```bash
pnpm demo:pass      # $0.001 → clean address: screened, verdict PASS, auto-paid on Base Sepolia
pnpm demo:block     # $0.001 → OFAC-sanctioned Lazarus Group address: verdict BLOCK, reason shown, nothing signed
pnpm demo:escalate  # $0.50 (over $0.10 threshold): World ID approval link+code → approve = paid / deny or 20-min expiry = aborted
pnpm seller & pnpm dashboard   # same three scenarios in the web UI at http://localhost:3000
```

Each demo spawns its own seller if one isn't running, and exits nonzero unless the scenario reached its expected terminal state.

## Setup

Prereqs: Node ≥ 24, pnpm ≥ 10.

```bash
pnpm install
cp .env.example .env
```

Fill in `.env`:

| Variable | How to get it |
|---|---|
| `EVM_PRIVATE_KEY` | Any throwaway testnet key (never a funded mainnet key). Fund its address with Base Sepolia USDC at [faucet.circle.com](https://faucet.circle.com) (20 USDC / 2h). No ETH needed — payments are gasless EIP-3009, the facilitator sponsors gas. |
| `SELLER_ADDRESS` | Any address you control (receives the demo payments). |
| `INTERCEPTA_API_KEY` | Request via the form on [docs.web3antivirus.io](https://docs.web3antivirus.io/reference/getting-started-1). |
| `WORLD_ID_CLIENT_ID` / `WORLD_ID_CLIENT_SECRET` | Register an OIDC client at [sandbox.auth.world.org/portal](https://sandbox.auth.world.org/portal) (confidential client; the device grant needs no working redirect, but registration requires an HTTPS redirect URL). |

Verify the stack layer by layer (same scripts gate every stage of development):

```bash
pnpm verify:harness     # scaffold + env validation + strict typecheck
pnpm verify:seller      # 402 + PAYMENT-REQUIRED header on all three endpoints
pnpm verify:payment     # real end-to-end payment settles on Base Sepolia
pnpm verify:guard       # policy engine unit checks (offline)
pnpm verify:intercepta  # live API smoke test: sanctioned payTo screens as BLOCK
```

## Track requirements

### 🛡 Intercepta

- **Live API call before signing, result decides the action** — call site: [`packages/guard/src/intercepta.ts`](packages/guard/src/intercepta.ts) (`quickScanAddress`, `scanToken`), invoked from [`packages/guard/src/index.ts`](packages/guard/src/index.ts) inside the x402 `onBeforePaymentCreation` hook wired in [`apps/agent/src/pipeline.ts`](apps/agent/src/pipeline.ts). The verdict (`PASS`/`BLOCK`/`ESCALATE`) is computed in [`packages/guard/src/policy.ts`](packages/guard/src/policy.ts) from `toxicScore` + `traits[]` (+ token `action`). No mocks anywhere in the payment path.
- **Pass + block demos with reason** — `pnpm demo:pass` and `pnpm demo:block`; the dashboard renders the raw quick-scan response (toxicScore, full `traits[]`) and the blocking trait(s) next to the verdict.
- **Mainnet screening target** — payments settle on Base Sepolia, but the screened `payTo` of the block demo is the real, OFAC-sanctioned Lazarus Group (Ronin Bridge exploiter) EOA `0x098B716B8Aaf21512996dC57EB0615e2383E2f96`, which live-scans at `toxicScore: 100` with `known_scammer` + `sanction_address` + `blacklist` traits. The payment token is screened via its mainnet twin (Base Sepolia USDC → Base mainnet USDC, `trust: whitelist`).
- **API feedback (from live integration):**
  1. Time to first successful call was under five minutes once the key arrived — `X-API-KEY` header, clean REST, no SDK needed.
  2. The most confusing part: quick-scan is **EOA-only** and returns 404 on contract addresses — our first BLOCK candidate (Tornado Cash router, a contract) silently "passed" as no-data until we caught it; the docs don't call this restriction out.
  3. The `traits[]` descriptions are demo gold — human-readable reasons we could pipe straight to the UI without any mapping table.
  4. Wishlist: a documented set of flagged test addresses per category (we had to hunt for a sanctioned EOA that actually flags), and 404-vs-"clean" disambiguation in quick-scan (an explicit `no_data` response would prevent unknown-address false-passes).
  5. Also, the scan-token docs example address is not a real token (404s), and remaining-credit visibility on the key would help hackathon budgeting.

### 🌐 World ID for Agents

- **Full journey** — `pnpm demo:escalate`: agent hits the $0.10 policy threshold → backend starts an OIDC **device authorization grant** (RFC 8628) at `sandbox.auth.world.org` → approval link + `user_code` surface in the CLI and as a QR code in the dashboard → owner proves with the sandbox World App and approves → backend polls the token endpoint, receives the `id_token`, **verifies it server-side with `jose` against the IdP JWKS** (issuer, audience, signature, `auth_time`) → only then is the payment signed.
- **Denied / expired / cancelled → no action** — `access_denied` and `expired_token` (20-min device-code lifetime) both resolve to a non-approved outcome in [`apps/agent/src/worldid.ts`](apps/agent/src/worldid.ts); the guard returns `abort` and the payment is never signed. The demo shows the deny path by pressing "deny" in the approval page.
- **Backend verification, client never trusted** — the agent only ever sees the approval link and user code; `device_code`, tokens, and the verified `sub` stay in the backend (`worldid.ts`). No client-supplied value is trusted.
- **Integration feedback** — *time to first success:* about 2 hours from "which docs are real?" to a fully working device-grant flow — fast, because it's standards-honest OIDC and any HTTP client works, no SDK required. *Main friction:* (1) discoverability — `sandbox.auth.world.org/docs` is a marketing SPA, and the actual integration guides are only served through the MCP server (`/mcp`, `get_idp_guide`), which is great for agents but hard for a human skimming with a browser; (2) the portal registers clients as `client_secret_basic`, but that's not surfaced anywhere — our first `client_secret_post` attempt got a bare `invalid_client` with no hint; (3) client registration demands an exact HTTPS redirect URL even for a device-grant-only client that never redirects. *One improvement:* publish the MCP-served guides as plain linkable web pages, and state the registered token-endpoint auth method on the portal's credential screen.

### 🤖 Curvegrid AI Agent

- **One-sentence summary** — top of this README.
- **Team + socials** — George, solo ([@George-WM](https://github.com/George-WM)).
- **Setup & test** — [Setup](#setup) and [Demo](#demo-one-command-each) above; every stage has a one-command verify script.

## Repo layout

```
apps/seller       x402 V2 paid API (Express, Base Sepolia) — 3 endpoints: clean / sanctioned payTo / over-threshold
apps/agent        buyer agent: payment pipeline (pre-sign guard hook), World ID escalation, demo CLI
apps/dashboard    web UI: trigger buttons, live SSE pipeline view, raw Intercepta panel, World ID QR, history
packages/guard    Intercepta client + PASS/BLOCK/ESCALATE policy engine
packages/shared   env validation + typed pipeline event bus
scripts/          one-command demos + per-stage verification harness
```

## Notes for judges

- x402 **V2** (`@x402/*` 2.27, CAIP-2 networks, `PAYMENT-REQUIRED` header) — not the legacy V1 packages.
- The x402 client's default spend controls are disabled (`spendControls: false`) so that every decision demonstrably comes from the Intercepta-backed policy engine, not SDK defaults.
- Payments are real: Base Sepolia USDC via the public `x402.org/facilitator`, e.g. settled tx [`0x662b9bc1…`](https://sepolia.basescan.org/tx/0x662b9bc1889c5fd904ed5e5863190db50b642c3b175c62546d27b3f4977750b4).
