# Handshake — AI Agent Payment Guardrail

> One-liner: A guardrail that screens every x402 payment an AI agent is about to sign with Intercepta's live risk API — auto-paying safe requests, blocking sanctioned/scam recipients, and escalating high-value payments to the agent's human owner via World ID for Agents.

Built solo at ETHGlobal Tokyo 2026.

## How it works

```
agent wants a paid API → HTTP 402 (x402 V2, Base Sepolia)
  → before signing: Intercepta quick-scan of payTo (mainnet reputation) + token scan
    → PASS      auto-sign & pay (EIP-3009, gasless)
    → BLOCK     abort, show reason (e.g. sanction_address)
    → ESCALATE  World ID device grant → human approves in World App → pay
                (deny / expiry / cancel → payment never happens)
```

## Demo

```bash
pnpm demo:pass      # $0.001 to a clean address → screened → auto-paid
pnpm demo:block     # payment to an OFAC-sanctioned address → blocked with reason
pnpm demo:escalate  # $0.50 payment → human approval via World ID → paid (or denied → aborted)
pnpm dashboard      # web UI: trigger payments, watch the pipeline live
```

## Setup

<!-- TODO(stage 9): full setup instructions -->
```bash
pnpm install
cp .env.example .env   # fill in keys — see comments in the file
pnpm verify:harness
pnpm seller            # terminal 1: paid API on Base Sepolia
pnpm demo:pass         # terminal 2
```

## Track requirements

### Intercepta
- [ ] Live API call before payment signing decides the next action (no mocks)
- [ ] Demo: 1 pass + 1 block with reason displayed
- [ ] Screened addresses are real mainnet addresses (payment itself on Base Sepolia)
- [ ] API call site: `packages/guard/src/intercepta.ts` <!-- TODO: confirm path -->
- [ ] API feedback (3–5 lines): <!-- TODO(stage 9) -->

### World ID for Agents
- [ ] Full journey: auth request → user completes → backend verification → protected action
- [ ] Denied / expired / cancelled → action does NOT run
- [ ] Verification on the backend (jose + JWKS), client responses never trusted
- [ ] Integration feedback (time-to-first-success, friction, one improvement): <!-- TODO(stage 9) -->

### Curvegrid AI Agent
- [x] One-sentence summary (top of this README)
- [ ] Team: George (<!-- TODO: social handle -->) — solo
- [x] Setup & test instructions (this README)

## Repo layout

```
apps/seller       x402 V2 paid API (Express, Base Sepolia)
apps/agent        buyer agent: payment pipeline + CLI demos
apps/dashboard    web UI (SSE live pipeline view)
packages/guard    Intercepta client + policy engine (PASS/BLOCK/ESCALATE)
packages/shared   env validation + pipeline event bus
```
