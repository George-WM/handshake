# Handshake — AI Agent Payment Guardrail

## 목표 (1문장)
AI 에이전트가 x402로 결제하기 전 Intercepta API로 리스크를 스크리닝하고, 고위험은 차단(BLOCK), 고액/중간 리스크는 World ID for Agents로 인간 소유자 승인(ESCALATE)을 받는 가드레일 MVP — ETHGlobal Tokyo 2026 솔로 제출.

## 절대 규칙 (해커톤 룰)
- 완전히 새 코드. 기존 프로젝트 재사용 금지 (공식 quickstart/boilerplate는 허용).
- 기능 단위로 자주 커밋. conventional commits (feat/fix/docs/chore). 대량 변경 단일 커밋 금지.
- public repo 전제. 시크릿은 .env에만, .env.example 항상 최신 유지.
- Intercepta는 **라이브 호출만 인정** — mock 응답으로 데모/제출 금지. 라이브 검증 전까지 4단계 "완료" 처리 금지.
- World ID 검증은 반드시 백엔드에서 (id_token을 jose+JWKS로 검증). 클라이언트/에이전트가 전달한 값 신뢰 금지.

## 핵심 기술 결정 (재조사 금지, 이 사실을 그대로 사용)
- **x402는 V2만 사용**: npm 스코프 `@x402/*` (v2.27.x). V1(`x402-fetch`, `x402-express`, network `"base-sepolia"`, `X-PAYMENT` 헤더)과 절대 혼용 금지.
  - 네트워크 식별자: CAIP-2 — Base Sepolia = `eip155:84532`, Base mainnet = `eip155:8453`.
  - 테스트넷 facilitator: `https://x402.org/facilitator` (Base Sepolia 지원, 키 불필요, 수수료 없음).
  - Base Sepolia USDC: `0x036CbD53842c5426634e7929541eC2318f3dCF7e` (6 decimals). buyer는 가스 불필요 (EIP-3009, facilitator 대납).
  - 가드레일 삽입 지점: `x402Client`의 **`onBeforePaymentCreation` 훅** — `context.selectedRequirements`(payTo/amount/asset/network) 검사 후 `{ abort: true, reason }` 반환으로 서명 전 중단.
  - 데모에선 `spendControls: false` (기본 $1 상한이 우리 가드보다 먼저 개입하는 것 방지).
- **Intercepta (Web3 Antivirus)**: base `https://api.web3antivirus.io`, 헤더 `X-API-KEY`.
  - Quick Scan Address: `GET /api/public/v2/extension/account/{address}/quick-scan` → `{ toxicScore, traits[] }`. 체인 파라미터 없음(메인넷 평판 기준 — 트랙 요건과 일치).
  - BLOCK trait: `sanction_address`, `known_scammer`, `blacklist`, `fake_phishing_transfer`, `rug_pull` 등.
  - Scan Token: `GET /api/public/v2/extension/token-intelligence/token/{address}/risks?chainId=1` → `{ riskScore, riskLevel, action: block|warn|info, detectors[] }`.
  - 무료 플랜은 크레딧 제한 — 호출 아껴 쓰기. scan-message는 스코프 제외 (Permit 계열만 지원).
  - **quick-scan은 EOA 전용** (컨트랙트 주소는 404 → 클라이언트가 중립 처리). BLOCK 데모 주소는 Lazarus Group EOA `0x098B716B8Aaf21512996dC57EB0615e2383E2f96` (라이브 확인: toxicScore 100, known_scammer+sanction_address+blacklist). Tornado 라우터는 컨트랙트라 사용 불가.
  - 토큰 스크리닝은 메인넷 등가 매핑으로 수행 (Base Sepolia USDC → Base mainnet USDC, guard의 MAINNET_TOKEN_EQUIVALENTS).
- **World ID for Agents**: sandbox IdP `https://sandbox.auth.world.org` — 표준 **OIDC Device Authorization Grant (RFC 8628)**. SDK 없음, raw fetch + `jose`로 구현.
  - `POST /api/v1/device_authorization` (scope=openid) → `{ device_code, user_code, verification_uri_complete, expires_in, interval }`. **클라이언트 인증은 `client_secret_basic`(Authorization 헤더)** — form body에 secret을 넣으면 `invalid_client` (라이브 확인).
  - `verification_uri_complete` + `user_code`를 인간에게 전달. `device_code`는 절대 노출 금지.
  - `POST /api/v1/token` (grant_type=urn:ietf:params:oauth:grant-type:device_code) 폴링. `authorization_pending`→대기, `slow_down`→interval+5s, **`access_denied`/`expired_token`/`invalid_grant`→중단(액션 미실행)**. 디바이스 코드 수명 20분. 자동 재시작 루프 금지.
  - 성공 시 `id_token`(RS256, 5분 수명)을 jose로 검증: issuer=`https://sandbox.auth.world.org`, aud=client_id, JWKS=`/.well-known/jwks.json`, 신선도는 `auth_time`(iat 아님).
  - 포털 등록: `https://sandbox.auth.world.org/portal` (사용자가 진행, client_id/secret은 .env로).

## 아키텍처 (pnpm 모노레포, TypeScript strict)
```
apps/seller     x402 V2 유료 API (Express). 엔드포인트 3개:
                  GET /api/data    $0.001 → 내 주소 (PASS 시나리오)
                  GET /api/risky   $0.001 → Lazarus 제재 EOA (BLOCK 시나리오)
                  GET /api/premium $0.50  → 내 주소, 임계값 초과 (ESCALATE 시나리오)
apps/agent      buyer 에이전트. 파이프라인 = 402 감지 → guard 스크리닝 → PASS/BLOCK/ESCALATE 분기.
                파이프라인을 라이브러리로 export (dashboard가 import). CLI 엔트리 별도.
apps/dashboard  웹 UI (필수 산출물, 8단계). Express + SSE + 정적 단일 페이지(다크 테마).
                결제 트리거 버튼 3개, 파이프라인 상태 실시간 표시, Intercepta 원본 응답 렌더,
                World ID 승인 링크+user_code(QR) 표시, 결제 히스토리 로그.
packages/guard  Intercepta HTTP 클라이언트 + 정책 엔진 (PASS/BLOCK/ESCALATE verdict).
packages/shared env 로딩/검증 유틸 + 파이프라인 이벤트 타입 (인메모리 EventEmitter, 과도한 추상화 금지).
```

## 정책 엔진 규칙 (packages/guard)
1. payTo 주소 quick-scan: BLOCK trait 존재 또는 toxicScore ≥ 70 → **BLOCK** (사유 = trait 목록)
2. 결제 토큰 scan-token: `action === "block"` → **BLOCK**
3. 금액 > ESCALATE_THRESHOLD_USD (기본 $0.10) 또는 중간 리스크(toxicScore 30~69, `action === "warn"`) → **ESCALATE**
4. 그 외 → **PASS**

## 코딩 컨벤션
- TypeScript strict. 최소 의존성 (dotenv 금지 — Node 24의 `process.loadEnvFile()` 사용).
- 과도한 추상화 금지. 파일 수 최소화. 실행은 `tsx` (빌드 스텝 없음).
- env 누락 시 `packages/shared`의 `requireEnv()`가 명확한 에러로 즉시 종료.

## 매 단계 완료 정의 (DoD)
해당 단계의 검증 스크립트(`scripts/verify/*.ts` 또는 `pnpm demo:*`)를 **실제 실행해 통과**해야 완료. 통과 전 다음 단계 진행 금지. 완료 시 커밋.

## 구현 순서 (승인된 계획, 2026-09-27 수정: dashboard 필수 승격)
1. ✅ 하네스 셋업 + 모노레포 스캐폴딩 → `pnpm verify:harness` 통과
2. ✅ seller (x402 V2, Base Sepolia) → `pnpm verify:seller` 통과
3. ✅ buyer 결제 e2e → `pnpm verify:payment` 통과 (settled tx 0x662b9bc1…, buyer 지갑 faucet 20 USDC 수령)
4. ✅ guard: 라이브 `pnpm verify:intercepta` + `pnpm demo:block` 통과 (Lazarus EOA → BLOCK, 서명 전 중단)
5. ✅ scan-token: 메인넷 등가 매핑으로 라이브 통과 (Base USDC whitelist/info; block 분기는 verify-guard 유닛 커버)
6. ✅ World ID ESCALATE: 승인(id_token 백엔드 검증, demo:escalate 풀 파이프라인 $0.50 정산) / 거부(dashboard 실시간 확인) / 만료(expired_token, 액션 미실행) 3경로 라이브 통과
7. ✅ CLI 데모 3종 연속 통과: demo:pass(정산) / demo:block(BLOCK, 미서명) / demo:escalate(승인→정산 tx 0x05a334…)
8. ✅ dashboard: PASS/BLOCK 라이브 렌더 확인 (Intercepta 원본 traits, BLOCK 사유), World ID QR/상태 패널 확인
9. README 90% (Intercepta 피드백 반영 완료; 데모 영상 링크만 남음)

## 제출 요건 체크리스트 (3개 트랙)
### Intercepta
- [ ] 결제 서명 전 라이브 API 호출 ≥ 1회, 결과가 다음 행동 결정 (mock 불인정)
- [ ] 데모: 통과 1건 + 차단 1건 (사유 화면 표시)
- [ ] 스크리닝 대상은 실제 메인넷 주소 (결제는 테스트넷 OK)
- [ ] README: API 호출 파일 경로 명시 + API 피드백 3~5줄
### World ID for Agents
- [ ] 인증 요청 → 사용자 완료 → 백엔드 검증 → 보호된 액션 실행 전체 여정 데모
- [ ] 거부/만료/취소 시 액션 미실행 경로 데모
- [ ] 검증은 백엔드에서 (jose + JWKS)
- [ ] README: 통합 피드백 (첫 성공까지 시간, 마찰 지점, 개선 1가지)
### Curvegrid AI Agent
- [ ] README: 1문장 요약 / 팀 소개 + 소셜 핸들 / 셋업·테스트 방법

## 외부 블로커 현황 (2026-09-27 갱신: 모두 해소)
- Intercepta API 키 ✅ / World ID client_id·secret ✅ — 라이브 검증 완료, .env에 저장됨
- buyer/seller는 로컬 생성 스로어웨이 테스트넷 키 (.env에 저장, 절대 실자산 금지). buyer 잔액: ~19.4 USDC (Base Sepolia)
- 남은 일: 데모 영상 촬영(docs/demo-script.md), README에 영상 링크. 레포: https://github.com/George-WM/handshake (public)
