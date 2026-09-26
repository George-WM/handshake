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
  - BLOCK 데모용 메인넷 주소 후보: Tornado Cash `0x722122dF12D4e14e13Ac3b6895a86e84145b6967`, `0x8589427373D6D84E98730D7795D8f6f8731FDA16` (키 도착 시 실제 플래그 확인 필수).
- **World ID for Agents**: sandbox IdP `https://sandbox.auth.world.org` — 표준 **OIDC Device Authorization Grant (RFC 8628)**. SDK 없음, raw fetch + `jose`로 구현.
  - `POST /api/v1/device_authorization` (client_id, client_secret, scope=openid) → `{ device_code, user_code, verification_uri_complete, expires_in, interval }`.
  - `verification_uri_complete` + `user_code`를 인간에게 전달. `device_code`는 절대 노출 금지.
  - `POST /api/v1/token` (grant_type=urn:ietf:params:oauth:grant-type:device_code) 폴링. `authorization_pending`→대기, `slow_down`→interval+5s, **`access_denied`/`expired_token`/`invalid_grant`→중단(액션 미실행)**. 디바이스 코드 수명 20분. 자동 재시작 루프 금지.
  - 성공 시 `id_token`(RS256, 5분 수명)을 jose로 검증: issuer=`https://sandbox.auth.world.org`, aud=client_id, JWKS=`/.well-known/jwks.json`, 신선도는 `auth_time`(iat 아님).
  - 포털 등록: `https://sandbox.auth.world.org/portal` (사용자가 진행, client_id/secret은 .env로).

## 아키텍처 (pnpm 모노레포, TypeScript strict)
```
apps/seller     x402 V2 유료 API (Express). 엔드포인트 3개:
                  GET /api/data    $0.001 → 내 주소 (PASS 시나리오)
                  GET /api/risky   $0.001 → Tornado 제재 주소 (BLOCK 시나리오)
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
1. ✅ 하네스 셋업 + 모노레포 스캐폴딩 → `pnpm verify:harness`
2. seller (x402 V2, Base Sepolia) → `pnpm verify:seller` (402 + PAYMENT-REQUIRED 헤더 확인)
3. buyer 결제 e2e (가드 없이) → `pnpm verify:payment` (paymentStatus=settled). 선행: Circle faucet USDC
4. guard: quick-scan + 정책 엔진 + onBeforePaymentCreation 연결 → `pnpm demo:block` (라이브 API 키 필요)
5. scan-token 추가 → verify 확장
6. World ID ESCALATE (승인/거부/만료 전부) → `pnpm demo:escalate`
7. CLI 데모 3종 최종 점검 (`demo:pass` / `demo:block` / `demo:escalate` 원커맨드)
8. **dashboard 웹 UI (필수)** — CLI 파이프라인 위에 씌움. demo 스크립트는 자동 검증용으로 유지
9. README 완성 (트랙 체크리스트 기반)

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

## 외부 블로커 현황 (2026-09-27)
- Intercepta API 키: Typeform 신청 완료, 대기 중 → 도착 즉시 라이브 검증
- World ID 포털 등록: 사용자 진행 중 → client_id/secret이 .env로 전달될 예정
