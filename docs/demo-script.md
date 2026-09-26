# 데모 영상 시나리오 (4분, ETHGlobal Tokyo 2026 제출용)

총 240초. 나레이션은 영어(심사위원용), 지문은 한국어.
사전 준비: `pnpm seller` + `pnpm dashboard` 실행, http://localhost:3000 열어두기,
World App(sandbox) 설치된 폰 준비, basescan 탭 미리 열기. 녹화 전 히스토리 비우기(dashboard 재시작).

---

## 장면 1 — 문제 제기 (0:00–0:15, 15초)

**화면**: 타이틀 슬라이드 또는 dashboard 첫 화면.

> "AI agents are getting wallets. With x402, an agent can pay for any API in milliseconds —
> and that's exactly the problem. One prompt injection, one malicious seller, and your agent
> streams money to a sanctioned address. Handshake is the guardrail."

## 장면 2 — 아키텍처 한 컷 (0:15–0:35, 20초)

**화면**: README의 플로우 다이어그램(또는 dashboard 상단) 표시. 마우스로 3개 버튼 훑기.

> "Every payment my agent is about to sign gets screened by Intercepta's live risk API,
> strictly before signing — inside x402's pre-payment hook. Three outcomes: PASS, BLOCK,
> or ESCALATE to the human owner through World ID. Let's run all three."

## 장면 3 — PASS (0:35–1:10, 35초)

**화면**: dashboard에서 `GET /api/data — $0.001` 버튼 클릭.
파이프라인 패널에 단계가 실시간으로 쌓이는 것을 보여줌:
402 → Intercepta screening → toxicScore=0 → verdict PASS → settled.

> "First, a normal purchase: one-tenth of a cent for weather data. The 402 comes back,
> Intercepta quick-scans the recipient — toxic score zero, no risk traits — verdict PASS,
> the agent signs, and the payment settles on Base Sepolia."

**클로즈업**: settled 라인의 basescan 링크 클릭 → 실제 트랜잭션 1~2초 노출.

> "That's a real on-chain settlement, not a mock."

## 장면 4 — BLOCK (1:10–2:00, 50초)

**화면**: `GET /api/risky — $0.001` 버튼 클릭. verdict BLOCK까지 진행되는 파이프라인.

> "Now the same agent hits a malicious seller. Same price, but the payout address is the
> OFAC-sanctioned Tornado Cash router — a real mainnet address."

**클로즈업 (필수, Intercepta 심사 기준)**: ① Intercepta 원본 응답 패널로 줌 —
`toxicScore`와 `traits[]` 배열의 `sanction_address` 항목을 마우스로 하이라이트.
② 파이프라인의 `verdict: BLOCK — payTo trait: sanction_address …` 라인 하이라이트.

> "Intercepta's live response flags it: sanction_address, toxic score in the nineties.
> The policy engine returns BLOCK with the reason on screen — and because this runs before
> payment creation, the EIP-3009 authorization is never signed. Nothing left the wallet."

**화면**: 히스토리 테이블에 verdict=BLOCK, status=blocked 행 표시.

## 장면 5 — ESCALATE: 승인 + 거부 (2:00–3:35, 95초)

### 5a. 승인 경로 (2:00–3:00, 60초)

**화면**: `GET /api/premium — $0.50` 버튼 클릭. verdict ESCALATE → World ID 패널에 QR + user_code 등장.

> "Third scenario: the address is clean, but fifty cents is over this agent's ten-cent
> autonomy threshold. The verdict is ESCALATE — the agent can't decide this alone.
> Handshake starts a World ID device grant: here's the approval link and the user code."

**화면**: 폰으로 QR 스캔 → 승인 페이지(요청자 이름 + user code 확인) → World App proof → Approve.
폰 화면을 PIP 또는 컷어웨이로. dashboard의 "waiting for owner…"가 approved로 바뀌고 결제 진행.

> "I scan it as the owner, verify I'm human with World ID, check the code matches, and approve.
> The backend polls the token endpoint, verifies the ID token against the JWKS — server-side,
> nothing the agent relays is trusted — and only then signs the payment. Settled."

### 5b. 거부 경로 (3:00–3:35, 35초)

**화면**: 같은 버튼 다시 클릭 → 새 QR → 이번엔 폰에서 **Deny** 탭.
dashboard 상태가 `denied`로 바뀌고 파이프라인이 `finished: denied`로 종료되는 것 표시.

> "And the path that matters for safety: same request, but this time the owner denies it.
> access_denied comes back from the poll, the guard aborts, and the payment is never signed.
> Expiry and cancellation end the same way — unauthorized by default."

**화면**: 히스토리에 paid / blocked / denied 세 행이 나란히 보이도록 잠깐 노출.

## 장면 6 — 마무리 (3:35–4:00, 25초)

**화면**: 히스토리 테이블 전체 → README 상단(레포) 컷.

> "That's Handshake: x402 for the rails, Intercepta for live risk screening before every
> signature, World ID for human-in-the-loop above the threshold. Safe autonomy for paying
> agents — everything you saw is one command away in the repo. Thanks!"

---

## 타이밍 요약

| 장면 | 구간 | 길이 |
|---|---|---|
| 1. 문제 제기 | 0:00–0:15 | 15초 |
| 2. 아키텍처 | 0:15–0:35 | 20초 |
| 3. PASS | 0:35–1:10 | 35초 |
| 4. BLOCK (traits 클로즈업) | 1:10–2:00 | 50초 |
| 5. ESCALATE (승인 60 + 거부 35) | 2:00–3:35 | 95초 |
| 6. 마무리 | 3:35–4:00 | 25초 |

## 촬영 체크리스트

- [ ] 녹화 직전 dashboard 재시작 (히스토리 초기화)
- [ ] buyer 지갑 USDC 잔액 ≥ $1.5 (escalate 2회 = $1.00 + 여유)
- [ ] World App sandbox 로그인 상태 + 승인 페이지 미리 1회 리허설
- [ ] BLOCK 장면에서 Intercepta 원본 JSON 패널 확대 배율 미리 설정
- [ ] basescan 탭 프리로드 (로딩 대기 시간 제거)
- [ ] 에스컬레이션 폴링 대기(수 초)는 편집에서 점프컷
